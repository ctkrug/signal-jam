import init, { greet } from "./wasm/signal_jam_core.js";

async function bootstrap(): Promise<void> {
  const status = document.querySelector<HTMLParagraphElement>("#boot-status");
  if (!status) return;

  try {
    await init();
    status.textContent = greet();
  } catch (err) {
    status.textContent = "Failed to load signal core";
    console.error(err);
  }
}

bootstrap();
