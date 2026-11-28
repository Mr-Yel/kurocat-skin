import type {
  ArmConnectorConfig,
  CharacterAnimation,
  CharacterLayer,
  CharacterPack,
} from './characterPack';

export interface CharacterMotionInput {
  is108: boolean;
  mouseBtnX: number;
  mouseBtnY: number;
  cursor: { x: number; y: number } | null;
  mouseNX: number;
  mouseLeft: boolean;
  mouseRight: boolean;
  mouseActiveAt: number;
  mouseClickAt: number;
  petEnergy: number;
  privacyMode: boolean;
  dragging: boolean;
  dragVelocityX: number;
  peekAmount?: number;
}

interface LayerMotion {
  x: number;
  y: number;
}

interface Point {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ease(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/**
 * Generic 2D pack renderer.
 *
 * Back layers and the animated body are drawn before desk input devices.
 * Eye/body overlays stay in that pass. Foreground hand layers are drawn by the
 * host after the mouse and keyboard, which lets an imported character put its
 * hand over the mouse instead of disappearing behind it.
 */
export class LayeredCharacterRenderer2D {
  private pack: CharacterPack | null = null;
  private images = new Map<string, HTMLImageElement>();
  private layerMotion = new Map<string, LayerMotion>();
  private gazeX = 0;
  private gazeY = 0;
  private bodyShift = 0;
  private bodyTilt = 0;
  private dragAmount = 0;
  private dragVelocity = 0;
  private dragLift = 0;
  private dragSway = 0;
  private dragTilt = 0;
  private blinkUntil = 0;
  private nextBlinkAt = performance.now() + 3800 + Math.random() * 2600;
  private activeAction = 'idle';
  private actionStartedAt = performance.now();
  private lastClickSeen = -10000;
  private clickUntil = -10000;

  public setPack(pack: CharacterPack | null): void {
    if (pack === this.pack) return;
    this.releaseImages();
    this.pack = pack;
    this.layerMotion.clear();
    this.gazeX = 0;
    this.gazeY = 0;
    this.bodyShift = 0;
    this.bodyTilt = 0;
    this.dragAmount = 0;
    this.dragVelocity = 0;
    this.dragLift = 0;
    this.dragSway = 0;
    this.dragTilt = 0;
    this.blinkUntil = 0;
    this.nextBlinkAt = performance.now() + 3800 + Math.random() * 2600;
    this.activeAction = 'idle';
    this.actionStartedAt = performance.now();
    this.lastClickSeen = -10000;
    this.clickUntil = -10000;
  }

  public clear(): void {
    this.setPack(null);
  }

  public getPack(): CharacterPack | null {
    return this.pack;
  }

  public hasPack(): boolean {
    return this.pack?.renderer === 'sprite2d';
  }

  public isReady(): boolean {
    if (!this.pack) return false;
    const idle = this.pack.animations.idle?.frames[0]?.url;
    if (!idle) return false;
    const img = this.ensureImage(idle);
    return img.complete && img.naturalWidth > 0;
  }

  public releaseImages(): void {
    for (const img of this.images.values()) {
      img.src = '';
    }
    this.images.clear();
  }

  public renderBack(
    ctx: CanvasRenderingContext2D,
    dt: number,
    now: number,
    input: CharacterMotionInput,
  ): void {
    const pack = this.pack;
    if (!pack || pack.renderer !== 'sprite2d') return;

    this.updateMotion(dt, now, input);
    const geom = this.computeGeometry(now, input);
    const animation = this.pickAnimation(now, input);

    for (const layer of pack.layers) {
      if (!layer.foreground && !this.isEyeOverlay(layer) && this.layerVisible(layer)) {
        this.drawLayer(ctx, layer, geom, input, now, dt);
      }
    }

    const image = this.animationImage(animation, now);
    if (!image) return;

    ctx.save();
    this.applyBodyTransform(ctx, geom);
    ctx.drawImage(image, -geom.drawW * 0.5, -geom.drawH + geom.pivotOff, geom.drawW, geom.drawH);
    ctx.restore();

    // Eye layers must be transformed with the body, but remain behind desk devices.
    for (const layer of pack.layers) {
      if (!layer.foreground && this.isEyeOverlay(layer) && this.layerVisible(layer)) {
        this.drawLayer(ctx, layer, geom, input, now, dt);
      }
    }
  }

  public renderFront(
    ctx: CanvasRenderingContext2D,
    dt: number,
    now: number,
    input: CharacterMotionInput,
  ): void {
    const pack = this.pack;
    if (!pack || pack.renderer !== 'sprite2d') return;
    const geom = this.computeGeometry(now, input);
    for (const layer of pack.layers) {
      if (layer.foreground && this.layerVisible(layer)) {
        this.drawLayer(ctx, layer, geom, input, now, dt);
      }
    }
  }

  private layerVisible(layer: CharacterLayer): boolean {
    return !layer.actions || layer.actions.includes(this.activeAction);
  }

  private isEyeOverlay(layer: CharacterLayer): boolean {
    return (
      Boolean(layer.gaze) ||
      layer.role === 'eye-details' ||
      layer.role === 'eyes' ||
      layer.role === 'eye-left' ||
      layer.role === 'eye-right' ||
      layer.role === 'pupil-left' ||
      layer.role === 'pupil-right'
    );
  }

  private ensureImage(url: string): HTMLImageElement {
    let image = this.images.get(url);
    if (!image) {
      image = new Image();
      image.decoding = 'async';
      image.src = url;
      this.images.set(url, image);
    }
    return image;
  }

  private updateMotion(dt: number, now: number, input: CharacterMotionInput): void {
    const pack = this.pack;
    const mouseActive =
      !input.privacyMode &&
      (input.mouseLeft || input.mouseRight || now - input.mouseActiveAt < 900);
    const dragging = input.dragging && !input.privacyMode && !input.peekAmount;
    this.dragAmount = ease(this.dragAmount, dragging ? 1 : 0, dragging ? 13 : 9, dt);
    const dragVelocityTarget = dragging
      ? clamp(input.dragVelocityX, -2.8, 2.8)
      : 0;
    this.dragVelocity = ease(this.dragVelocity, dragVelocityTarget, 8, dt);
    this.dragLift = ease(
      this.dragLift,
      pack ? pack.motion.dragLift * this.dragAmount : 0,
      11,
      dt,
    );
    this.dragSway = ease(
      this.dragSway,
      pack ? -this.dragVelocity * pack.motion.dragSway * this.dragAmount : 0,
      9,
      dt,
    );
    const dragTiltTarget = pack
      ? (-this.dragVelocity * pack.motion.dragTiltDeg * Math.PI) / 180
      : 0;
    this.dragTilt = ease(this.dragTilt, dragTiltTarget, 9, dt);

    const leanTarget = mouseActive ? (pack?.motion.mouseLean ?? -14) : 0;
    this.bodyShift = ease(
      this.bodyShift,
      leanTarget + (input.mouseNX - 0.5) * 5 + this.dragSway,
      10,
      dt,
    );
    this.bodyTilt = ease(
      this.bodyTilt,
      (mouseActive ? -0.055 : 0) + this.dragTilt,
      11,
      dt,
    );

    const clickAt = Math.max(input.mouseClickAt, this.lastClickSeen);
    if (clickAt > this.lastClickSeen) {
      this.lastClickSeen = clickAt;
      this.clickUntil = clickAt + 780;
    }

    if (now >= this.nextBlinkAt && !input.privacyMode) {
      this.blinkUntil = now + 145;
      this.nextBlinkAt = now + 4200 + Math.random() * 2800;
    }

    const gazeTarget = this.resolveGazeTarget(now, input);
    let targetX = 0;
    let targetY = 0;
    if (gazeTarget) {
      const geom = this.computeGeometry(now, input);
      const gazeLayer = pack?.layers.find(
        (layer) => layer.gaze && this.layerVisible(layer),
      );
      const eye = gazeLayer
        ? geom.point(gazeLayer.anchor[0], gazeLayer.anchor[1])
        : geom.point(0.5, 0.47);
      targetX = clamp((gazeTarget.x - eye.x) / 42, -1, 1);
      targetY = clamp((gazeTarget.y - eye.y) / 48, -1, 1);
    }
    const gazeSmoothing = pack?.motion.gazeSmoothing ?? 13;
    this.gazeX = ease(this.gazeX, targetX, gazeSmoothing, dt);
    this.gazeY = ease(this.gazeY, targetY, gazeSmoothing, dt);
  }

  private resolveGazeTarget(now: number, input: CharacterMotionInput): Point | null {
    if (input.privacyMode) return null;
    if (input.cursor) return input.cursor;
    if (input.mouseLeft || input.mouseRight || now - input.mouseActiveAt < 1200) {
      return { x: input.mouseBtnX, y: input.mouseBtnY };
    }
    return null;
  }

  private pickAnimation(now: number, input: CharacterMotionInput): CharacterAnimation {
    const pack = this.pack!;
    const candidate =
      input.dragging && pack.motion.dragAnimation
        ? pack.motion.dragAnimation
        : input.privacyMode
          ? pack.motion.privacyAnimation
          : now < this.clickUntil || input.petEnergy > 0.25
            ? pack.motion.clickAnimation
            : now < this.blinkUntil
              ? pack.motion.blinkAnimation
              : null;
    const name = candidate && pack.animations[candidate] ? candidate : 'idle';
    if (name !== this.activeAction) {
      this.activeAction = name;
      this.actionStartedAt = now;
    }
    return pack.animations[name] || pack.animations.idle;
  }

  private animationImage(animation: CharacterAnimation, now: number): HTMLImageElement | null {
    if (animation.frames.length === 0) return null;
    const elapsed = Math.max(0, now - this.actionStartedAt);
    const fallbackDuration = 1000 / animation.fps;
    const cycleDuration = animation.frames.reduce(
      (sum, frame) => sum + (frame.durationMs ?? fallbackDuration),
      0,
    );
    const localElapsed =
      animation.loop && cycleDuration > 0 ? elapsed % cycleDuration : elapsed;
    let index = 0;
    if (animation.frames.some((frame) => frame.durationMs !== null)) {
      let cursor = 0;
      index = animation.frames.length - 1;
      for (let i = 0; i < animation.frames.length; i++) {
        const duration = animation.frames[i].durationMs ?? fallbackDuration;
        if (localElapsed < cursor + duration) {
          index = i;
          break;
        }
        cursor += duration;
      }
    } else {
      const frameIndex = Math.floor((localElapsed / 1000) * animation.fps);
      index = animation.loop
        ? frameIndex % animation.frames.length
        : Math.min(animation.frames.length - 1, Math.max(0, frameIndex));
    }
    return this.ensureImage(animation.frames[index].url);
  }

  private computeGeometry(now: number, input: CharacterMotionInput) {
    const pack = this.pack!;
    const charX = input.is108 ? 268 : 192;
    const baseY = pack.canvas.baseY + Math.sin(now * 0.0032) * 1.4 - this.dragLift;
    const drawW = pack.canvas.drawWidth * (input.is108 ? 268 / 262 : 1);
    const drawH = drawW * (pack.canvas.height / pack.canvas.width);
    const pivotOff = pack.canvas.pivotOffset;
    const charCenterX = charX + this.bodyShift;
    const pivotY = baseY - pivotOff;
    const point = (normX: number, normY: number): Point => {
      const lx = (normX - 0.5) * drawW;
      const ly = normY * drawH - drawH + pivotOff;
      const cos = Math.cos(this.bodyTilt);
      const sin = Math.sin(this.bodyTilt);
      return {
        x: charCenterX + lx * cos - ly * sin,
        y: pivotY + lx * sin + ly * cos,
      };
    };
    return { drawW, drawH, pivotOff, charCenterX, pivotY, point };
  }

  private applyBodyTransform(
    ctx: CanvasRenderingContext2D,
    geom: ReturnType<LayeredCharacterRenderer2D['computeGeometry']>,
  ): void {
    ctx.translate(geom.charCenterX, geom.pivotY);
    ctx.rotate(this.bodyTilt);
  }

  private drawLayer(
    ctx: CanvasRenderingContext2D,
    layer: CharacterLayer,
    geom: ReturnType<LayeredCharacterRenderer2D['computeGeometry']>,
    input: CharacterMotionInput,
    now: number,
    dt: number,
  ): void {
    const image = this.ensureImage(layer.url);
    if (!image.complete || image.naturalWidth <= 0) return;

    let target: LayerMotion = { x: 0, y: 0 };
    if (layer.gaze) {
      target = { x: this.gazeX * layer.gaze.maxX, y: this.gazeY * layer.gaze.maxY };
    } else if (layer.followMouse && !input.privacyMode) {
      const active =
        input.mouseLeft || input.mouseRight || now - input.mouseActiveAt < 900;
      if (active) {
        const anchor = geom.point(layer.anchor[0], layer.anchor[1]);
        const joint = geom.point(
          layer.followMouse.joint[0],
          layer.followMouse.joint[1],
        );
        const press = input.mouseLeft || input.mouseRight ? layer.followMouse.pressOffsetY : 0;
        let wristX = input.mouseBtnX + layer.followMouse.offsetX;
        let wristY = input.mouseBtnY + layer.followMouse.offsetY + press;
        let shoulderDx = wristX - joint.x;
        let shoulderDy = wristY - joint.y;
        const restReach = Math.hypot(anchor.x - joint.x, anchor.y - joint.y);
        const maxReach = Math.max(
          restReach * 0.72,
          layer.followMouse.maxReach ?? restReach + layer.followMouse.maxDistance,
        );
        const shoulderDistance = Math.hypot(shoulderDx, shoulderDy);
        if (shoulderDistance > maxReach && shoulderDistance > 0.001) {
          const scale = maxReach / shoulderDistance;
          wristX = joint.x + shoulderDx * scale;
          wristY = joint.y + shoulderDy * scale;
        }
        let dx = wristX - anchor.x;
        let dy = wristY - anchor.y;
        const distance = Math.hypot(dx, dy);
        if (distance > layer.followMouse.maxDistance && distance > 0.001) {
          const scale = layer.followMouse.maxDistance / distance;
          dx *= scale;
          dy *= scale;
        }
        const tilt = this.bodyTilt;
        const cos = Math.cos(-tilt);
        const sin = Math.sin(-tilt);
        target = { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
      }
    }

    let motion = this.layerMotion.get(layer.id);
    if (!motion) {
      motion = { x: 0, y: 0 };
      this.layerMotion.set(layer.id, motion);
    }
    motion.x = ease(motion.x, target.x, layer.followMouse ? 22 : 18, dt);
    motion.y = ease(motion.y, target.y, layer.followMouse ? 22 : 18, dt);

    const anchor = geom.point(layer.anchor[0], layer.anchor[1]);
    ctx.save();
    ctx.globalAlpha *= layer.opacity;
    ctx.translate(geom.charCenterX, geom.pivotY);
    ctx.rotate(this.bodyTilt);
    if (motion.x !== 0 || motion.y !== 0) {
      ctx.translate(anchor.x - geom.charCenterX, anchor.y - geom.pivotY);
      ctx.translate(motion.x, motion.y);
      ctx.translate(geom.charCenterX - anchor.x, geom.pivotY - anchor.y);
    }
    if (layer.followMouse?.connector && Math.hypot(motion.x, motion.y) > 1.5) {
      const localAnchor = {
        x: (layer.anchor[0] - 0.5) * geom.drawW,
        y: layer.anchor[1] * geom.drawH - geom.drawH + geom.pivotOff,
      };
      const localJoint = {
        x: (layer.followMouse.joint[0] - 0.5) * geom.drawW,
        y:
          layer.followMouse.joint[1] * geom.drawH -
          geom.drawH +
          geom.pivotOff,
      };
      this.drawArmConnector(
        ctx,
        layer.followMouse.connector,
        layer.role === 'hand-left' ? 'left' : 'right',
        localJoint,
        { x: localAnchor.x + motion.x, y: localAnchor.y + motion.y },
      );
    }
    ctx.drawImage(image, -geom.drawW * 0.5, -geom.drawH + geom.pivotOff, geom.drawW, geom.drawH);
    ctx.restore();
  }

  private drawArmConnector(
    ctx: CanvasRenderingContext2D,
    connector: ArmConnectorConfig,
    side: 'left' | 'right',
    shoulder: Point,
    wrist: Point,
  ): void {
    const dx = wrist.x - shoulder.x;
    const dy = wrist.y - shoulder.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.5) return;

    const sideSign = side === 'left' ? -1 : 1;
    const bendDistance = Math.min(18, length * 0.17) * (connector.bend / 0.16);
    const control = {
      x: (shoulder.x + wrist.x) * 0.5 + sideSign * bendDistance,
      y: (shoulder.y + wrist.y) * 0.5 + bendDistance * 0.45,
    };
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(shoulder.x, shoulder.y);
      ctx.quadraticCurveTo(control.x, control.y, wrist.x, wrist.y);
    };

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (connector.outlineColor && connector.outlineWidth > 0) {
      ctx.strokeStyle = connector.outlineColor;
      ctx.lineWidth = connector.width + connector.outlineWidth * 2;
      path();
      ctx.stroke();
    }
    ctx.strokeStyle = connector.color;
    ctx.lineWidth = connector.width;
    path();
    ctx.stroke();
    ctx.restore();
  }
}
