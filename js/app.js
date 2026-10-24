// Cartos — punto de entrada de la app
// Tarea 1: de momento solo pinta el nombre de la app, sin lógica real todavía.
// En tareas siguientes, este archivo pasará a decidir qué pantalla mostrar
// (login / connect / onboarding / dashboard) según el estado de sesión,
// y a montar el router y la navbar (ver js/ui/router.js, js/ui/navbar.js).

function renderSplash() {
  const root = document.getElementById('app');
  root.innerHTML = `
    <div style="
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 8px;
    ">
      <h1 style="font-size: 28px; letter-spacing: 0.04em;">CARTOS</h1>
      <p class="text-muted">esqueleto — tarea 1</p>
    </div>
  `;
}

renderSplash();
