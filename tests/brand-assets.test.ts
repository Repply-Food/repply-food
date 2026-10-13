import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const oficiais = "identidade-visual/logos/app";
const icones = [
  ["icon-192.png", 192, "any"],
  ["icon-512.png", 512, "any"],
  ["icon-maskable-192.png", 192, "maskable"],
  ["icon-maskable-512.png", 512, "maskable"],
] as const;
const pngs = [
  ...icones.map(([nome, tamanho]) => [nome, tamanho] as const),
  ["apple-touch-icon.png", 180],
  ["favicon-16.png", 16],
  ["favicon-32.png", 32],
  ["favicon-48.png", 48],
] as const;

describe("ativos oficiais da marca", () => {
  it("manifesto declara os quatro ícones com dimensão, MIME e propósito corretos", () => {
    const manifesto = JSON.parse(
      readFileSync("app/manifest.webmanifest", "utf8")
    );
    expect(manifesto.name).toBe("repply food.");
    expect(manifesto.icons).toEqual(
      icones.map(([nome, tamanho, purpose]) => ({
        src: `/${nome}`,
        sizes: `${tamanho}x${tamanho}`,
        type: "image/png",
        purpose,
      }))
    );
  });

  it.each(pngs)(
    "%s é PNG oficial íntegro, acessível no public e com dimensão %i",
    (nome, tamanho) => {
      expect(existsSync(`public/${nome}`)).toBe(true);
      const conteudo = readFileSync(`public/${nome}`);
      expect(conteudo.equals(readFileSync(`${oficiais}/${nome}`))).toBe(true);
      expect(conteudo.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(conteudo.toString("ascii", 12, 16)).toBe("IHDR");
      expect(conteudo.readUInt32BE(16)).toBe(tamanho);
      expect(conteudo.readUInt32BE(20)).toBe(tamanho);
    }
  );

  it("favicon SVG e ICO preservam conteúdo oficial e os tamanhos internos", () => {
    for (const nome of ["favicon.svg", "favicon.ico"]) {
      expect(existsSync(`public/${nome}`)).toBe(true);
      expect(
        readFileSync(`public/${nome}`).equals(
          readFileSync(`${oficiais}/${nome}`)
        )
      ).toBe(true);
    }
    expect(readFileSync("public/favicon.svg", "utf8")).toMatch(/<svg[\s>]/);
    const ico = readFileSync("public/favicon.ico");
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
    expect([0, 1, 2].map((i) => [ico[6 + 16 * i], ico[7 + 16 * i]])).toEqual([
      [16, 16],
      [32, 32],
      [48, 48],
    ]);
  });
});
