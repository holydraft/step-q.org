const HERO_LOGO_FRAMES = [
  "LOGO-SVG-GIFs/LOGO-SVG-GIF-1.svg",
  "LOGO-SVG-GIFs/LOGO-SVG-GIF-2.svg",
  "LOGO-SVG-GIFs/LOGO-SVG-GIF-3.svg",
  "LOGO-SVG-GIFs/LOGO-SVG-GIF-4.svg",
  "LOGO-SVG-GIFs/LOGO-SVG-GIF-5.svg"
];

const HERO_LOGO_FRAME_MS = 550;

window.addEventListener("DOMContentLoaded", () => {
  const image = document.getElementById("brandLogoAnimation");
  if (!image) return;

  let frameIndex = 0;
  window.setInterval(() => {
    frameIndex = (frameIndex + 1) % HERO_LOGO_FRAMES.length;
    image.src = HERO_LOGO_FRAMES[frameIndex];
  }, HERO_LOGO_FRAME_MS);
});