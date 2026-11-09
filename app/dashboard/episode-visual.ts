export type EpisodeVisual = {
  day: number;
  pillar: "PIKIR" | "PRODUK" | "SISTEM" | "PEMBELI";
  image_hook: string;
};

type Pen = CanvasRenderingContext2D;

function line(ctx: Pen, points: Array<[number, number]>, width = 8) {
  ctx.beginPath();
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  points.forEach(([x, y], index) => index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.stroke();
}

function oval(ctx: Pen, x: number, y: number, rx: number, ry: number, width = 7) {
  ctx.beginPath();
  ctx.lineWidth = width;
  ctx.ellipse(x, y, rx, ry, -0.03, 0, Math.PI * 2);
  ctx.stroke();
}

function doodleStar(ctx: Pen, x: number, y: number, size: number) {
  line(ctx, [[x - size, y], [x + size, y]], 5);
  line(ctx, [[x, y - size], [x, y + size]], 5);
  line(ctx, [[x - size * 0.7, y - size * 0.7], [x + size * 0.7, y + size * 0.7]], 3);
}

function doodleHuman(ctx: Pen, x: number, y: number, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  oval(ctx, 0, -78, 35, 37);
  ctx.fillStyle = "#111";
  ctx.beginPath(); ctx.arc(-12, -83, 3, 0, Math.PI * 2); ctx.arc(12, -83, 3, 0, Math.PI * 2); ctx.fill();
  line(ctx, [[-10, -64], [0, -58], [10, -64]], 3);
  line(ctx, [[0, -41], [0, 65]], 10);
  line(ctx, [[0, -10], [-58, 30], [-85, 5]], 9);
  line(ctx, [[0, -10], [58, 23], [82, -8]], 9);
  line(ctx, [[0, 65], [-46, 132], [-70, 132]], 9);
  line(ctx, [[0, 65], [47, 132], [70, 132]], 9);
  ctx.restore();
}

function drawThought(ctx: Pen, variation: number) {
  doodleHuman(ctx, 335, 660, 1.1);
  oval(ctx, 610, 535, 130, 110);
  line(ctx, [[515, 610], [490, 632], [530, 626]], 5);
  if (variation % 2 === 0) {
    oval(ctx, 610, 506, 46, 54, 8);
    line(ctx, [[582, 550], [592, 573], [626, 573], [637, 550]], 7);
    line(ctx, [[588, 588], [633, 588]], 8);
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI / 3.5;
      line(ctx, [[610 + Math.cos(angle) * 68, 508 + Math.sin(angle) * 72], [610 + Math.cos(angle) * 84, 508 + Math.sin(angle) * 92]], 5);
    }
  } else {
    line(ctx, [[543, 504], [581, 545], [633, 477]], 11);
    doodleStar(ctx, 662, 546, 24);
  }
  line(ctx, [[210, 813], [772, 813]], 5);
}

function drawProduct(ctx: Pen, variation: number) {
  line(ctx, [[330, 591], [488, 664], [673, 588], [511, 526], [330, 591]], 9);
  line(ctx, [[330, 591], [330, 748], [498, 821], [498, 664]], 9);
  line(ctx, [[498, 664], [673, 588], [673, 745], [498, 821]], 9);
  line(ctx, [[349, 541], [485, 599], [530, 536], [388, 474], [349, 541]], 7);
  line(ctx, [[529, 536], [660, 480], [706, 553], [579, 611]], 7);
  if (variation % 2 === 0) {
    line(ctx, [[461, 509], [452, 418], [581, 418], [577, 510]], 7);
    line(ctx, [[474, 444], [561, 444]], 5);
    line(ctx, [[474, 468], [550, 468]], 5);
    doodleStar(ctx, 730, 472, 22);
  } else {
    oval(ctx, 521, 435, 70, 54, 7);
    line(ctx, [[500, 438], [515, 452], [545, 410]], 7);
    doodleStar(ctx, 307, 485, 23);
  }
  doodleHuman(ctx, 218, 694, 0.75);
}

function drawSystem(ctx: Pen, variation: number) {
  ctx.lineWidth = 11;
  ctx.strokeRect(326, 445, 285, 362);
  line(ctx, [[422, 474], [513, 474]], 5);
  oval(ctx, 468, 769, 14, 14, 5);
  line(ctx, [[365, 535], [570, 535]], 5);
  if (variation % 2 === 0) {
    line(ctx, [[364, 597], [432, 597], [466, 643], [550, 556]], 10);
    oval(ctx, 666, 563, 72, 72, 8);
    oval(ctx, 666, 563, 30, 30, 7);
  } else {
    oval(ctx, 466, 633, 66, 55, 7);
    line(ctx, [[426, 634], [454, 663], [507, 599]], 9);
    line(ctx, [[647, 520], [743, 520], [720, 499]], 7);
    line(ctx, [[743, 520], [720, 543]], 7);
  }
  doodleStar(ctx, 720, 703, 20);
}

function drawBuyer(ctx: Pen, variation: number) {
  doodleHuman(ctx, 317, 667, 0.96);
  doodleHuman(ctx, 680, 667, 0.96);
  oval(ctx, 490, 509, 128, 73, 8);
  line(ctx, [[455, 571], [441, 594], [482, 581]], 7);
  if (variation % 2 === 0) {
    line(ctx, [[434, 508], [470, 537], [542, 477]], 8);
  } else {
    oval(ctx, 459, 505, 8, 8, 6);
    oval(ctx, 491, 505, 8, 8, 6);
    oval(ctx, 523, 505, 8, 8, 6);
  }
  line(ctx, [[206, 827], [790, 827]], 5);
  doodleStar(ctx, 745, 480, 18);
}

function drawHeadline(ctx: Pen, headline: string) {
  const words = headline.toUpperCase().trim().split(/\s+/);
  let lines: string[] = [];
  let fontSize = 93;
  while (fontSize >= 64) {
    ctx.font = `900 ${fontSize}px Impact, "Arial Black", sans-serif`;
    const candidate: string[] = [];
    for (const word of words) {
      const last = candidate.length - 1;
      if (last >= 0 && ctx.measureText(`${candidate[last]} ${word}`).width <= 790) candidate[last] += ` ${word}`;
      else candidate.push(word);
    }
    lines = candidate;
    if (lines.length <= 3) break;
    fontSize -= 5;
  }
  ctx.fillStyle = "#111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${fontSize}px Impact, "Arial Black", sans-serif`;
  const spacing = fontSize * 1.05;
  const startY = 235 - ((lines.length - 1) * spacing) / 2;
  lines.forEach((wordLine, index) => ctx.fillText(wordLine, 500, startY + index * spacing, 800));
}

/** Creates an original, editable-batch-friendly doodle card in the visual language of the older EPS posts. */
export async function makeEpisodeDoodleCard(episode: EpisodeVisual): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 1000;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Perangkat tidak bisa membuat visual konten.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 1000, 1000);
  ctx.strokeStyle = "#111";
  ctx.fillStyle = "#111";
  ctx.lineWidth = 7;
  ctx.strokeRect(24, 24, 952, 952);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '900 33px "Arial Black", sans-serif';
  ctx.fillText(`EPS ${String(episode.day).padStart(3, "0")} · ${episode.pillar}`, 500, 86);
  line(ctx, [[360, 124], [640, 124]], 4);
  drawHeadline(ctx, episode.image_hook);

  ctx.fillStyle = "#ffe36b";
  ctx.fillRect(752, 757, 74, 69);
  ctx.strokeRect(752, 757, 74, 69);
  ctx.fillStyle = "#111";
  switch (episode.pillar) {
    case "PIKIR": drawThought(ctx, episode.day); break;
    case "PRODUK": drawProduct(ctx, episode.day); break;
    case "SISTEM": drawSystem(ctx, episode.day); break;
    case "PEMBELI": drawBuyer(ctx, episode.day); break;
  }
  ctx.textAlign = "center";
  ctx.font = '700 24px "Arial Black", sans-serif';
  ctx.fillText("PEBISNIS DIGITAL", 500, 921);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Visual gagal dibuat.")), "image/webp", 0.88);
  });
  return new File([blob], `eps-${episode.day}.webp`, { type: blob.type || "image/webp" });
}
