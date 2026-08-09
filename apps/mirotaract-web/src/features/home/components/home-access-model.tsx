export function HomeAccessModel() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--mr-space-2)",
        padding: "var(--mr-space-6)",
        maxWidth: 640,
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      <h2 style={{ margin: 0, fontSize: "1.25rem" }}>
        Cómo funciona el acceso
      </h2>
      <p
        style={{
          margin: 0,
          color: "var(--mr-color-text-muted)",
        }}
      >
        El acceso es otorgado a miembros habilitados por su organización. Si
        recibiste una invitación por correo, seguí el enlace para crear tu
        cuenta; si ya tenés una, ingresá con tus credenciales.
      </p>
    </section>
  );
}
