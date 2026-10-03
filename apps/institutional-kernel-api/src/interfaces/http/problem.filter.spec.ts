import { NotFoundException } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";

import { ProblemFilter } from "./problem.filter";

function buildHost() {
  const response = {
    status: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    send: jest.fn(),
  };
  const request = {
    header: jest.fn().mockReturnValue(undefined),
    originalUrl: "/kernel/v1/periods/missing",
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe("ProblemFilter", () => {
  it("maps a Prisma P2025 (record not found) error to 404, not 500", () => {
    const filter = new ProblemFilter();
    const { host, response } = buildHost();

    filter.catch({ code: "P2025", message: "Record not found" }, host);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.send).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, code: "KERNEL_NOT_FOUND" }),
    );
  });

  it("still maps an unrelated unexpected error to 500", () => {
    const filter = new ProblemFilter();
    const { host, response } = buildHost();

    filter.catch(new Error("boom"), host);

    expect(response.status).toHaveBeenCalledWith(500);
  });

  it("keeps using the exception's own status for HttpException", () => {
    const filter = new ProblemFilter();
    const { host, response } = buildHost();

    filter.catch(new NotFoundException("gone"), host);

    expect(response.status).toHaveBeenCalledWith(404);
  });

  it("always includes a traceId (E9), generated when no header came", () => {
    const filter = new ProblemFilter();
    const { host, response } = buildHost();

    filter.catch(new NotFoundException("gone"), host);

    expect(response.send).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
      }),
    );
  });

  it("reuses the request's trace id and leaves the problem for the log", () => {
    const filter = new ProblemFilter();
    const response = {
      status: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
      send: jest.fn(),
      locals: {} as Record<string, unknown>,
    };
    const request = {
      header: jest.fn().mockReturnValue(undefined),
      originalUrl: "/api/kernel/v1/service/x",
      traceId: "trace-from-middleware",
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new NotFoundException("gone"), host);

    expect(response.send).toHaveBeenCalledWith(
      expect.objectContaining({ traceId: "trace-from-middleware" }),
    );
    expect(response.locals.requestLogProblem).toEqual({
      code: "KERNEL_HTTP_404",
      type: "https://api.rotaract4845.com/errors/kernel_http_404",
    });
  });
});
