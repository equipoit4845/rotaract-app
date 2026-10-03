/** The roster is read completely: SDK paginator, or a loop over nextCursor/hasMore. */
import { codeFiles, stripComments } from "../files.js";
import { fail, pass } from "./result.js";

export default {
  id: "pagination",
  title: "Paginación por cursor",
  critical: false,
  grade({ solution }) {
    let readsMembers = false;
    for (const file of codeFiles(solution).filter((f) => !f.client)) {
      const code = stripComments(file);
      if (!/members|\/members/.test(code)) continue;
      readsMembers = true;
      if (
        /for\s+await\s*\([^)]*\bof\b[^)]*members\.list\(|members\.list\([^)]*\)[\s\S]{0,40}\.(all|pages)\(|async\s+for\s+\w+\s+in\s+[\w.]*members\.list\(|for\s+\w+\s+in\s+[\w.]*members\.list\(/.test(
          code,
        )
      )
        return pass(`Usa el paginador del SDK en ${file.path}.`);
      if (
        /nextCursor|next_cursor/.test(code) &&
        /hasMore|has_more|cursor/.test(code) &&
        /(while|do\s*\{|for\s*\()/.test(code)
      )
        return pass(`Recorre las páginas con el cursor en ${file.path}.`);
    }
    return fail(
      readsMembers
        ? "Lee el padrón pero solo la primera página (sin cursor ni paginador)."
        : "No encontré la lectura del padrón.",
    );
  },
};
