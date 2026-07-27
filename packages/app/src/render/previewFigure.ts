// 角色选择页的待机动图小人：不进物理，纯 resolvePose 摆姿 + drawCharacter 渲染。
// 鸭子相机（drawCharacter 只用 cam.toScreen / cam.scale）+ 假 Game（只读 characterId /
// wonFreeze / c.limbs[l].grip——先例见 tools/src/editor.ts editStub）。

import { characterById, applyBias } from "@kkc/core/model/characters.ts";
import { makeBody, abilitiesForLevel } from "@kkc/core/model/body.ts";
import { resolvePose, desiredBend, Orientation, Limb } from "@kkc/core/model/skeleton.ts";
import { Vec2 } from "@kkc/core/math/vec2.ts";
import { Game } from "@kkc/core/sim/gameState.ts";
import { Camera } from "./camera.ts";
import { drawCharacter } from "./drawCharacter.ts";

/**
 * 在 (cx, groundY) 画一个约 heightPx 高的站姿角色：呼吸摇摆 + 左手挥手。
 * t 为调用方累计的动画时钟（秒）。
 */
export function drawPreviewFigure(
  ctx: CanvasRenderingContext2D,
  cx: number,
  groundY: number,
  heightPx: number,
  characterId: string,
  t: number,
) {
  const chDef = characterById(characterId);
  const body = makeBody(chDef.physique, applyBias(abilitiesForLevel(5), chDef.abilityBias));
  const armL = body.upperArm + body.foreArm;
  const legL = body.thigh + body.shank;
  const footY = legL * 0.97; // 近伸直站立（骨盆为原点，y 向下）
  const wave = Math.sin(t * 3.2);
  const targets: Record<Limb, Vec2> = {
    LF: { x: -body.hipWidth / 2 - body.thigh * 0.06, y: footY },
    RF: { x: body.hipWidth / 2 + body.thigh * 0.06, y: footY },
    // 右手自然下垂（贴身微外摆）
    RH: { x: body.shoulderWidth / 2 + armL * 0.14, y: -body.torsoLen + armL * 0.92 },
    // 左手举高挥手
    LH: {
      x: -body.shoulderWidth / 2 - armL * (0.5 + wave * 0.1),
      y: -body.torsoLen - armL * (0.62 - Math.abs(wave) * 0.12),
    },
  };
  const pelvis: Vec2 = { x: 0, y: 0 };
  const ori: Orientation = { lean: Math.sin(t * 1.3) * 0.05, shoulderTwist: 0, hipTwist: 0 };
  const bend = desiredBend(body, pelvis, ori, targets);
  const pose = resolvePose(body, pelvis, ori, targets, bend);

  // 鸭子相机：骨盆原点世界坐标 → 屏幕（脚踩 groundY）
  const totalH = footY + body.torsoLen + body.neckLen + body.headR * 2;
  const k = heightPx / (totalH * 1.12);
  const cam = {
    scale: k,
    toScreen: (p: Vec2) => ({ x: cx + p.x * k, y: groundY + (p.y - footY) * k }),
  } as unknown as Camera;
  const fake = {
    characterId,
    wonFreeze: false,
    c: {
      limbs: {
        LH: { grip: "open" },
        RH: { grip: "open" },
        LF: { grip: "smear" },
        RF: { grip: "smear" },
      },
    },
  } as unknown as Game;
  drawCharacter(ctx, cam, pose, fake);
}
