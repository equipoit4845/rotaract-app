import { ServiceUnavailableException } from '@nestjs/common';
import { AccessService, PERMISSION_MANAGE, PERMISSION_USE } from './access.service';
import type { KernelService } from './kernel.service';

function fakeKernel(checkMany: jest.Mock): KernelService {
  return { districtId: 'district-4845', client: { permissions: { checkMany } } } as unknown as KernelService;
}

describe('AccessService', () => {
  afterEach(() => jest.useRealTimers());

  it('asks the kernel for both module permissions in the district', async () => {
    const checkMany = jest.fn().mockResolvedValue([{ allowed: true }, { allowed: false }]);
    const access = new AccessService(fakeKernel(checkMany));

    await expect(access.forPerson('p1')).resolves.toEqual({ canUse: true, canManage: false });
    expect(checkMany).toHaveBeenCalledWith([
      { personId: 'p1', permission: PERMISSION_USE, organizationId: 'district-4845' },
      { personId: 'p1', permission: PERMISSION_MANAGE, organizationId: 'district-4845' },
    ]);
  });

  it('caches the answer for a minute, then asks again', async () => {
    jest.useFakeTimers();
    const checkMany = jest.fn().mockResolvedValue([{ allowed: true }, { allowed: true }]);
    const access = new AccessService(fakeKernel(checkMany));

    await access.forPerson('p1');
    await access.forPerson('p1');
    expect(checkMany).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(61_000);
    await access.forPerson('p1');
    expect(checkMany).toHaveBeenCalledTimes(2);
  });

  it('forget() drops the cached answer', async () => {
    const checkMany = jest.fn().mockResolvedValue([{ allowed: true }, { allowed: true }]);
    const access = new AccessService(fakeKernel(checkMany));

    await access.forPerson('p1');
    access.forget('p1');
    await access.forPerson('p1');
    expect(checkMany).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the kernel cannot answer', async () => {
    const checkMany = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const access = new AccessService(fakeKernel(checkMany));

    await expect(access.forPerson('p1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('treats anything but allowed === true as denied', async () => {
    const checkMany = jest.fn().mockResolvedValue([{ allowed: 'yes' }, {}]);
    const access = new AccessService(fakeKernel(checkMany));

    await expect(access.forPerson('p1')).resolves.toEqual({ canUse: false, canManage: false });
  });
});
