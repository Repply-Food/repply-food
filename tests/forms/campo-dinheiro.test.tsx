import "@testing-library/jest-dom/vitest";
import { CampoDinheiro } from "@/components/forms/campo-dinheiro";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

function Harness() {
  const [v, setV] = useState("");
  return (
    <>
      <CampoDinheiro aria-label="Meta" value={v} onChange={setV} />
      <output>{v}</output>
    </>
  );
}

describe("CampoDinheiro", () => {
  it("mostra o valor inicial formatado", () => {
    render(
      <CampoDinheiro aria-label="Meta" value="30000.00" onChange={() => {}} />
    );
    expect(screen.getByLabelText("Meta")).toHaveValue("30.000,00");
  });
  it("devolve a string numérica ao digitar", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Meta"), {
      target: { value: "1.250,50" },
    });
    expect(screen.getByText("1250.50")).toBeInTheDocument();
  });
  it("apagar o campo devolve string vazia", () => {
    render(<Harness />);
    const campo = screen.getByLabelText("Meta");
    fireEvent.change(campo, { target: { value: "1.250,50" } });
    fireEvent.change(campo, { target: { value: "" } });
    expect(screen.getByRole("status")).toHaveTextContent("");
  });
});
