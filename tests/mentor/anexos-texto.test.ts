// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// O acordo entre o servidor e a tela: `TIPOS_ANEXO` (extensão → tipo, em
// `lib/mentor/anexos.ts`, server-only) e `ROTULO_DO_TIPO_DE_ANEXO` (tipo →
// rótulo, em `lib/mentor/anexos-texto.ts`, o espelho que a tela importa).
// Se um lado ganhar um tipo e o outro não, a lista quebra (rótulo
// `undefined`) — este teste quebra junto, de propósito.

vi.mock("server-only", () => ({}));

import { TIPOS_ANEXO } from "@/lib/mentor/anexos";
import { ROTULO_DO_TIPO_DE_ANEXO } from "@/lib/mentor/anexos-texto";

describe("tipos de anexo x rótulos da tela", () => {
  it("todo tipo do servidor tem rótulo na tela, e todo rótulo existe no servidor", () => {
    const tiposDoServidor = [...new Set(Object.values(TIPOS_ANEXO))].sort();
    const tiposDaTela = Object.keys(ROTULO_DO_TIPO_DE_ANEXO).sort();

    expect(tiposDaTela).toEqual(tiposDoServidor);
  });
});
