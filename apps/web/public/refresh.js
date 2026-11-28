// Independent of React and the old application bundle. Never delete user storage.
const status = document.getElementById("status");
const retry = document.getElementById("retry");
function version(worker) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(
        new Error(
          "La versión anterior sigue activa. Intenta de nuevo con conexión.",
        ),
      );
    }, 2000);
    channel.port1.onmessage = ({ data }) => {
      clearTimeout(timer);
      channel.port1.close();
      if (data?.type === "PULSO_VERSION" && data.cacheEnabled === false)
        resolve(data.build);
      else reject(new Error("No se pudo verificar la actualización."));
    };
    worker.postMessage({ type: "PULSO_VERSION" }, [channel.port2]);
  });
}
async function refresh() {
  retry.hidden = true;
  status.textContent = "Buscando la versión actual de Pulso…";
  try {
    if (!("serviceWorker" in navigator))
      throw new Error(
        "Este navegador no permite actualizar la PWA. Abre Pulso en Safari o Chrome con HTTPS.",
      );
    const registration = await navigator.serviceWorker.register("/sw.js", {
      updateViaCache: "none",
    });
    await registration.update();
    const deadline = Date.now() + 30000;
    let build;
    while (Date.now() < deadline) {
      registration.waiting?.postMessage({ type: "PULSO_ACTIVATE" });
      if (registration.active?.state === "activated") {
        try {
          build = await version(registration.active);
          break;
        } catch {
          /* Older worker: wait for replacement. */
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!build)
      throw new Error(
        "No se pudo activar la versión actual. Revisa tu conexión y vuelve a intentar.",
      );
    await Promise.all(
      (await caches.keys())
        .filter((key) => key.startsWith("pulso-"))
        .map((key) => caches.delete(key)),
    );
    status.textContent = "Pulso actualizado. Abriendo tu espacio…";
    location.replace("/?__pulso_build=" + encodeURIComponent(build));
  } catch (error) {
    status.textContent = error.message || "No se pudo actualizar Pulso.";
    retry.hidden = false;
  }
}
retry.addEventListener("click", refresh);
void refresh();
