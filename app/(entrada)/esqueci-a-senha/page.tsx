import { FormularioEsqueci } from "./formulario-esqueci";

export const metadata = { title: "Esqueci a senha · repply food." };

export default function PaginaEsqueci() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Esqueci a senha</h1>
        <p className="text-sm text-muted-foreground">
          Digite o e-mail de acesso. Vamos mandar um link para você criar uma
          senha nova.
        </p>
      </div>
      <FormularioEsqueci />
    </section>
  );
}
