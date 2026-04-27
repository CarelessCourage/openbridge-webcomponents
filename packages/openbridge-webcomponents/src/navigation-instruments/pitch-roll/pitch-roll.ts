import {LitElement, css, html, nothing, svg} from 'lit';
import {property} from 'lit/decorators.js';
import '../watch/watch.js';
import {
  VesselImage,
  VesselImageSize,
  WatchCircleType,
  type WatchArea,
  OUTER_RING_RADIUS,
  innerRingRadiusFor,
  vesselImages,
} from '../watch/watch.js';
import {TickmarkType} from '../watch/tickmark.js';
import {AdviceState, AdviceType, AngleAdviceRaw} from '../watch/advice.js';
import {customElement} from '../../decorator.js';
import {Priority} from '../types.js';
import {
  computeZoomToFitArcFrame,
  normalizeArcAngle,
  shiftArcFrameToOuterEdge,
} from '../../svghelpers/arc-frame.js';

export enum PitchRollPriorityElement {
  pitch = 'pitch',
  roll = 'roll',
}

/** Half-side of the centre overlay viewBox in SVG units. */
const CENTRE_HALF = 200;

/**
 * Empty diagonal corner gap (in central-layer / display pixels on the
 * default 400 px container) that must remain between adjacent zoomed arc
 * bands. Each axis arc is shortened just enough so its outer-ring corner
 * stays at least this far away from the inner-ring corner of the
 * neighbouring axis.
 */
const CORNER_GAP_PX = 16;

/** Numerical safety floor when an axis arc has to collapse for clearance. */
const MIN_ARC_HALF_DEG = 2;

@customElement('obc-pitch-roll')
export class ObcPitchRoll extends LitElement {
  @property({type: Number}) pitch = 0;
  @property({type: Number}) roll = 0;
  @property({type: Number}) minAvgPitch = 0;
  @property({type: Number}) maxAvgPitch = 0;
  @property({type: Number}) minAvgRoll = 0;
  @property({type: Number}) maxAvgRoll = 0;
  @property({type: String}) vesselImageFore: VesselImage = VesselImage.psvFore;
  @property({type: String}) vesselImageSide: VesselImage = VesselImage.psvSide;
  @property({type: Number}) scaleForeImage = 1;
  @property({type: Number}) maxPitchAdvice: number | undefined = undefined;
  @property({type: Number}) maxRollAdvice: number | undefined = undefined;
  @property({type: Boolean}) triggerPitchAdvice = false;
  @property({type: Boolean}) triggerRollAdvice = false;
  @property({type: String}) priority: Priority = Priority.regular;
  @property({type: Array, attribute: false})
  priorityElements: PitchRollPriorityElement[] = [
    PitchRollPriorityElement.pitch,
    PitchRollPriorityElement.roll,
  ];
  @property({type: Boolean}) zoomToFitArc: boolean = false;
  /**
   * Half-extent of each of the four watch arcs in degrees, measured from the
   * arc's natural center (0°/90°/180°/270°). Each arc spans
   * `center ± arcAngle`. Default `30` reproduces the historical 60°-wide
   * arcs; smaller values produce narrower arcs that, combined with
   * `zoomToFitArc`, reveal more detail in the relevant motion range.
   */
  @property({type: Number}) arcAngle: number = 30;
  /**
   * Optional per-axis override for the pitch arcs (top + bottom). Falls
   * back to {@link arcAngle} when undefined. Useful for rectangular layouts
   * where pitch and roll need different angular extents.
   */
  @property({type: Number}) pitchArcAngle?: number;
  /**
   * Optional per-axis override for the roll arcs (left + right). Falls
   * back to {@link arcAngle} when undefined.
   */
  @property({type: Number}) rollArcAngle?: number;

  private priorityFor(element: PitchRollPriorityElement): Priority {
    const selected = Array.isArray(this.priorityElements)
      ? this.priorityElements
      : [];
    return selected.includes(element) ? this.priority : Priority.regular;
  }

  private needleColor(element: PitchRollPriorityElement): string {
    return this.priorityFor(element) === Priority.enhanced
      ? 'var(--instrument-enhanced-secondary-color)'
      : 'var(--instrument-regular-secondary-color)';
  }

  private barColor(element: PitchRollPriorityElement): string {
    return this.priorityFor(element) === Priority.enhanced
      ? 'var(--instrument-enhanced-tertiary-color)'
      : 'var(--instrument-regular-tertiary-color)';
  }

  private get normalizedScaleForeImage(): number {
    if (!Number.isFinite(this.scaleForeImage)) {
      return 1;
    }
    return Math.max(0, Math.min(2, this.scaleForeImage));
  }

  /** Requested (clamped to a minimum) half-extent for each axis. */
  private get requestedPitchArcAngle(): number {
    return normalizeArcAngle(this.pitchArcAngle ?? this.arcAngle, 30);
  }
  private get requestedRollArcAngle(): number {
    return normalizeArcAngle(this.rollArcAngle ?? this.arcAngle, 30);
  }

  override render() {
    const pitchReq = this.requestedPitchArcAngle;
    const rollReq = this.requestedRollArcAngle;
    const areas = [
      {
        startAngle: 90 - pitchReq,
        endAngle: 90 + pitchReq,
        roundOutsideCut: true,
        roundInsideCut: true,
      },
      {
        startAngle: 270 - pitchReq,
        endAngle: 270 + pitchReq,
        roundOutsideCut: true,
        roundInsideCut: true,
      },
      {
        startAngle: 360 - rollReq,
        endAngle: rollReq,
        roundOutsideCut: true,
        roundInsideCut: true,
      },
      {
        startAngle: 180 - rollReq,
        endAngle: 180 + rollReq,
        roundOutsideCut: true,
        roundInsideCut: true,
      },
    ];

    const overlayViewBox = `-${CENTRE_HALF} -${CENTRE_HALF} ${CENTRE_HALF * 2} ${CENTRE_HALF * 2}`;
    const vesselScale = 224 / 160;

    return html`
      <div class="container">
        <svg viewBox="${overlayViewBox}">
          ${svg`
            <line
              x1="-150"
              y1="0"
              x2="150"
              y2="0"
              stroke="var(--instrument-frame-tertiary-color)"
            />
            <g
              style="transform: rotate(${this.pitch}deg) scale(${vesselScale}) translate(-80px, -80px);"
            >
              ${this.zoomToFitArc ? vesselImages[this.vesselImageSide] : nothing}
            </g>
            <g
              style="transform: rotate(${this.roll}deg) scale(${vesselScale * this.normalizedScaleForeImage}) translate(-80px, -80px);"
            >
              ${this.zoomToFitArc ? vesselImages[this.vesselImageFore] : nothing}
            </g>
          `}
        </svg>
        ${this.zoomToFitArc
          ? this.renderZoomedArcs(pitchReq, rollReq)
          : this.renderFullWatch(areas)}
      </div>
    `;
  }

  /**
   * Zoomed-arc layer: four CSS-rotated `<obc-watch>` instances, each
   * containing a single arc rendered at the watch's natural top
   * (`0° ± arcAngle`). Each watch handles its own `zoomToFitArc` framing
   * so each visible arc spans almost the full container — exactly like the
   * pitch and roll narrow stories. The four are rotated 0 / 90 / 180 / 270
   * to land at top / right / bottom / left. Top + bottom carry pitch data,
   * left + right carry roll data.
   *
   * Each axis can request its own half-extent via `pitchArcAngle` /
   * `rollArcAngle`. The zoom-fit frame for each axis is computed at the
   * REQUESTED half-extent so band thickness is preserved. The arc actually
   * rendered inside that frame is then shortened (clamped half-extent) just
   * enough that adjacent corners stay {@link CORNER_GAP_PX} apart in
   * display pixels.
   */
  private renderZoomedArcs(pitchReq: number, rollReq: number) {
    const tickmarks = [{angle: 0, type: TickmarkType.main}];

    // ---- Per-axis zoom-fit frames (requested half-extents) -------------
    const ext = 48;
    const targetSize = (176 + ext) * 2;
    const innerNat = innerRingRadiusFor(WatchCircleType.double);
    const buildFrame = (halfDeg: number) => {
      const areas: WatchArea[] = [
        {
          startAngle: -halfDeg,
          endAngle: halfDeg,
          roundOutsideCut: true,
          roundInsideCut: true,
        },
      ];
      const baseFrame = computeZoomToFitArcFrame({
        areas,
        outerRadius: OUTER_RING_RADIUS,
        innerRadius: innerNat,
        extension: ext,
        targetSize,
      });
      const subArcFrame = shiftArcFrameToOuterEdge(
        baseFrame,
        OUTER_RING_RADIUS + baseFrame.radiusOffset,
        OUTER_RING_RADIUS,
        CENTRE_HALF
      );
      // Display scale: how many container px per obc-watch SVG unit.
      const scale = (CENTRE_HALF * 2) / subArcFrame.width;
      const Rdisp = (OUTER_RING_RADIUS + baseFrame.radiusOffset) * scale;
      const thickDisp = (OUTER_RING_RADIUS - innerNat) * scale;
      return {subArcFrame, Rdisp, thickDisp};
    };
    const pitchFrame = buildFrame(pitchReq);
    const rollFrame = buildFrame(rollReq);

    // ---- Corner-gap clamping in display px ------------------------------
    // Top arc band, with rendered half-extent α_p', occupies the rectangle:
    //   x ∈ [-T_p, T_p],   T_p  = R_p · sin α_p'
    //   y ∈ [-OR, -OR + R_p·(1-cos α_p') + T_thk_p]
    // Right arc band (CSS-rotated 90° CW), with rendered α_r', occupies:
    //   x ∈ [OR - R_r·(1-cos α_r') - T_thk_r, OR]
    //   y ∈ [-T_r, T_r],   T_r = R_r · sin α_r'
    // (OR = OUTER_RING_RADIUS in display px = 184)
    // For the top-right corner to stay clear (with a gap of CORNER_GAP_PX)
    // we need the X-ranges to be separated:
    //   T_p + R_r·(1-cos α_r') + T_thk_r + GAP ≤ OR        (A)
    // and by symmetry (top vs left):
    //   T_p + R_r·(1-cos α_r') + T_thk_r + GAP ≤ OR        (same as A)
    // Right corner check (right vs top — Y-ranges):
    //   T_r + R_p·(1-cos α_p') + T_thk_p + GAP ≤ OR        (B)
    // The two inequalities couple α_p' and α_r' but each RHS depends only
    // on the other axis's angle, so a few fixed-point iterations converge.
    const OR = OUTER_RING_RADIUS;
    const limit = OR - CORNER_GAP_PX;
    const safeAsin = (v: number) => Math.asin(Math.min(1, Math.max(0, v)));
    let aP = (pitchReq * Math.PI) / 180;
    let aR = (rollReq * Math.PI) / 180;
    for (let i = 0; i < 24; i++) {
      const Tp = pitchFrame.Rdisp * Math.sin(aP);
      const Tr = rollFrame.Rdisp * Math.sin(aR);
      const Dp = pitchFrame.Rdisp * (1 - Math.cos(aP)) + pitchFrame.thickDisp;
      const Dr = rollFrame.Rdisp * (1 - Math.cos(aR)) + rollFrame.thickDisp;
      const slackA = limit - (Tp + Dr);
      const slackB = limit - (Tr + Dp);
      if (slackA >= -0.25 && slackB >= -0.25) break;
      // Constraint A is too tight ⇒ shrink Tp (i.e. cap aP).
      if (slackA < 0) {
        const TpMax = Math.max(0, limit - Dr);
        aP = Math.min(aP, safeAsin(TpMax / pitchFrame.Rdisp));
      }
      if (slackB < 0) {
        const TrMax = Math.max(0, limit - Dp);
        aR = Math.min(aR, safeAsin(TrMax / rollFrame.Rdisp));
      }
    }
    const pitchClampedDeg = Math.max(MIN_ARC_HALF_DEG, (aP * 180) / Math.PI);
    const rollClampedDeg = Math.max(MIN_ARC_HALF_DEG, (aR * 180) / Math.PI);

    const subAreas = (halfDeg: number): WatchArea[] => [
      {
        startAngle: -halfDeg,
        endAngle: halfDeg,
        roundOutsideCut: true,
        roundInsideCut: true,
      },
    ];
    const pitchAreas = subAreas(pitchClampedDeg);
    const rollAreas = subAreas(rollClampedDeg);

    const pitchAdvices = this.subAdvices('pitch');
    const rollAdvices = this.subAdvices('roll');

    // Clip each sub-watch to the angular sector actually covered by the
    // (possibly shortened) arc so the indicator pill, bar end-of-range
    // limit lines, and any other decoration cannot leak past the visible
    // band. The clip is a triangle in the element's CSS box, with one
    // vertex at the watch origin (SVG 0,0 mapped to CSS px) and two
    // vertices at the intersection of the sector edges with the top edge
    // of the box. Applied in unrotated local coords; CSS rotation then
    // carries it to the correct cardinal side.
    const sectorClip = (
      halfDeg: number,
      frame: typeof rollFrame.subArcFrame
    ): string => {
      // Watch origin (SVG 0,0) in CSS percentages of the element box.
      // Element fills the 100% × 100% .container; obc-watch fills it with
      // viewBox = frame.{x,y,width,height}, so SVG (0,0) sits at:
      //   (-frame.x / frame.width, -frame.y / frame.height)
      const oxPct = (-frame.x / frame.width) * 100;
      const oyPct = (-frame.y / frame.height) * 100;
      // Sector half-angle, expressed as the horizontal offset (in pct)
      // a ray reaches when traveling from the origin up to the top edge.
      const dxPct = oyPct * Math.tan((halfDeg * Math.PI) / 180);
      // Clamp to box bounds so half-angles ≥ 45° still produce a polygon
      // that reaches the corners instead of going off-canvas.
      const lx = Math.max(0, oxPct - dxPct);
      const rx = Math.min(100, oxPct + dxPct);
      return `polygon(${oxPct}% ${oyPct}%, ${lx}% 0%, ${rx}% 0%)`;
    };
    const pitchClip = sectorClip(pitchClampedDeg, pitchFrame.subArcFrame);
    const rollClip = sectorClip(rollClampedDeg, rollFrame.subArcFrame);

    const rollNeedles = [
      {
        angle: this.roll,
        fillColor: this.needleColor(PitchRollPriorityElement.roll),
        strokeColor: 'var(--border-silhouette-color)',
      },
    ];
    const pitchNeedles = [
      {
        angle: this.pitch,
        fillColor: this.needleColor(PitchRollPriorityElement.pitch),
        strokeColor: 'var(--border-silhouette-color)',
      },
    ];
    const rollBars = [
      {
        startAngle: this.minAvgRoll,
        endAngle: this.maxAvgRoll,
        fillColor: this.barColor(PitchRollPriorityElement.roll),
      },
    ];
    const pitchBars = [
      {
        startAngle: this.minAvgPitch,
        endAngle: this.maxAvgPitch,
        fillColor: this.barColor(PitchRollPriorityElement.pitch),
      },
    ];

    const subWatch = (
      rotation: number,
      arcFrame: typeof rollFrame.subArcFrame,
      areas: WatchArea[],
      barAreas: typeof rollBars,
      needles: typeof rollNeedles,
      advices: AngleAdviceRaw[],
      clipPath: string
    ) => html`
      <obc-watch
        class="sub-watch"
        style="transform: rotate(${rotation}deg); clip-path: ${clipPath};"
        .watchCircleType=${WatchCircleType.double}
        .zoomToFitArc=${true}
        .arcFrame=${arcFrame}
        .areas=${areas}
        .barAreas=${barAreas}
        .needles=${needles}
        .vessels=${[]}
        .tickmarks=${tickmarks}
        .advices=${advices}
      ></obc-watch>
    `;

    return html`
      ${subWatch(
        0,
        rollFrame.subArcFrame,
        rollAreas,
        rollBars,
        rollNeedles,
        rollAdvices,
        rollClip
      )}
      ${subWatch(
        90,
        pitchFrame.subArcFrame,
        pitchAreas,
        pitchBars,
        pitchNeedles,
        pitchAdvices,
        pitchClip
      )}
      ${subWatch(
        180,
        rollFrame.subArcFrame,
        rollAreas,
        rollBars,
        rollNeedles,
        rollAdvices,
        rollClip
      )}
      ${subWatch(
        270,
        pitchFrame.subArcFrame,
        pitchAreas,
        pitchBars,
        pitchNeedles,
        pitchAdvices,
        pitchClip
      )}
    `;
  }

  /**
   * Caution advices for a single sub-watch axis, emitted at sub-watch local
   * angles (centred on 0°). The outer extent uses the natural cap (30° for
   * pitch, 45° for roll) regardless of any arc clamping; the sub-watch's
   * sector clip-path hides the portion that lies past the visible band so
   * the advice's outer end-tickmark never sits on the band edge.
   */
  private subAdvices(axis: 'pitch' | 'roll'): AngleAdviceRaw[] {
    const advices: AngleAdviceRaw[] = [];
    const max = axis === 'pitch' ? this.maxPitchAdvice : this.maxRollAdvice;
    if (max === undefined) return advices;
    const trigger =
      axis === 'pitch' ? this.triggerPitchAdvice : this.triggerRollAdvice;
    const outer = axis === 'pitch' ? 30 : 45;
    const inner = Math.min(max, outer);
    const state = trigger ? AdviceState.triggered : AdviceState.regular;
    advices.push({
      minAngle: -outer,
      maxAngle: -inner,
      type: AdviceType.caution,
      state,
      hideMinTickmark: true,
    });
    advices.push({
      minAngle: inner,
      maxAngle: outer,
      type: AdviceType.caution,
      state,
      hideMaxTickmark: true,
    });
    return advices;
  }

  /** Full unzoomed watch — original single-instance render. */
  private renderFullWatch(areas: WatchArea[]) {
    return html`
      <obc-watch
        .watchCircleType=${WatchCircleType.double}
        .zoomToFitArc=${false}
        .areas=${areas}
        .barAreas=${[
          {
            startAngle: this.minAvgRoll,
            endAngle: this.maxAvgRoll,
            fillColor: this.barColor(PitchRollPriorityElement.roll),
          },
          {
            startAngle: 180 + this.minAvgRoll,
            endAngle: 180 + this.maxAvgRoll,
            fillColor: this.barColor(PitchRollPriorityElement.roll),
          },
          {
            startAngle: 90 + this.minAvgPitch,
            endAngle: 90 + this.maxAvgPitch,
            fillColor: this.barColor(PitchRollPriorityElement.pitch),
          },
          {
            startAngle: 270 + this.minAvgPitch,
            endAngle: 270 + this.maxAvgPitch,
            fillColor: this.barColor(PitchRollPriorityElement.pitch),
          },
        ]}
        .needles=${[
          {
            angle: this.roll,
            fillColor: this.needleColor(PitchRollPriorityElement.roll),
            strokeColor: 'var(--border-silhouette-color)',
          },
          {
            angle: 180 + this.roll,
            fillColor: this.needleColor(PitchRollPriorityElement.roll),
            strokeColor: 'var(--border-silhouette-color)',
          },
          {
            angle: 90 + this.pitch,
            fillColor: this.needleColor(PitchRollPriorityElement.pitch),
            strokeColor: 'var(--border-silhouette-color)',
          },
          {
            angle: 270 + this.pitch,
            fillColor: this.needleColor(PitchRollPriorityElement.pitch),
            strokeColor: 'var(--border-silhouette-color)',
          },
        ]}
        .vessels=${[
          {
            size: VesselImageSize.large,
            vesselImage: this.vesselImageSide,
            transform: `rotate(${this.pitch}deg)`,
          },
          {
            size: VesselImageSize.large,
            vesselImage: this.vesselImageFore,
            transform: `rotate(${this.roll}deg) scale(${this.normalizedScaleForeImage})`,
          },
        ]}
        .tickmarks=${[
          {angle: 0, type: TickmarkType.main},
          {angle: 90, type: TickmarkType.main},
          {angle: 180, type: TickmarkType.main},
          {angle: 270, type: TickmarkType.main},
        ]}
        .advices=${this.advices}
      ></obc-watch>
    `;
  }

  private get advices(): AngleAdviceRaw[] {
    const pitchReq = this.requestedPitchArcAngle;
    const rollReq = this.requestedRollArcAngle;
    const advices = [];
    if (this.maxPitchAdvice !== undefined) {
      const outer = Math.min(pitchReq, 30);
      const inner = Math.min(this.maxPitchAdvice, outer);
      const state = this.triggerPitchAdvice
        ? AdviceState.triggered
        : AdviceState.regular;
      advices.push({
        minAngle: 90 - outer,
        maxAngle: 90 - inner,
        type: AdviceType.caution,
        state: state,
        hideMinTickmark: true,
      });
      advices.push({
        minAngle: 90 + inner,
        maxAngle: 90 + outer,
        type: AdviceType.caution,
        state: state,
        hideMaxTickmark: true,
      });
      advices.push({
        minAngle: 270 - outer,
        maxAngle: 270 - inner,
        type: AdviceType.caution,
        state: state,
        hideMinTickmark: true,
      });
      advices.push({
        minAngle: 270 + inner,
        maxAngle: 270 + outer,
        type: AdviceType.caution,
        state: state,
        hideMaxTickmark: true,
      });
    }
    if (this.maxRollAdvice !== undefined) {
      const outer = Math.min(rollReq, 45);
      const inner = Math.min(this.maxRollAdvice, outer);
      const state = this.triggerRollAdvice
        ? AdviceState.triggered
        : AdviceState.regular;
      advices.push({
        minAngle: -outer,
        maxAngle: -inner,
        type: AdviceType.caution,
        state: state,
        hideMinTickmark: true,
      });
      advices.push({
        minAngle: inner,
        maxAngle: outer,
        type: AdviceType.caution,
        state: state,
        hideMaxTickmark: true,
      });
      advices.push({
        minAngle: 180 - outer,
        maxAngle: 180 - inner,
        type: AdviceType.caution,
        state: state,
        hideMinTickmark: true,
      });
      advices.push({
        minAngle: 180 + inner,
        maxAngle: 180 + outer,
        type: AdviceType.caution,
        state: state,
        hideMaxTickmark: true,
      });
    }
    return advices;
  }

  static override styles = css`
    * {
      box-sizing: border-box;
    }

    .container {
      position: relative;
      width: 100%;
      height: 100%;
    }

    .container > * {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'obc-pitch-roll': ObcPitchRoll;
  }
}
