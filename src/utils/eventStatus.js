const getEventStartEnd = (item) => {
  if (item.startTime && item.endTime) {
    return { start: new Date(item.startTime), end: new Date(item.endTime) };
  }
  if (item.stages && item.stages.length) {
    const times = item.stages.flatMap((s) => [
      new Date(s.startTime),
      new Date(s.endTime),
    ]);
    return {
      start: new Date(Math.min(...times)),
      end: new Date(Math.max(...times)),
    };
  }
  return { start: new Date(0), end: new Date(0) };
};

const getStagesTimeline = (item) => {
  const stages = Array.isArray(item?.stages) ? item.stages : [];
  const normalized = stages
    .map((s) => ({
      ...s,
      start: new Date(s.startTime),
      end: new Date(s.endTime),
    }))
    .filter((s) => !Number.isNaN(s.start.getTime()) && !Number.isNaN(s.end.getTime()));

  normalized.sort((a, b) => a.start.getTime() - b.start.getTime());
  const firstStart = normalized[0]?.start || new Date(0);
  const lastEnd = normalized[normalized.length - 1]?.end || new Date(0);

  return { stages: normalized, firstStart, lastEnd };
};

export const getStageStatus = (stage) => {
  if (!stage?.startTime || !stage?.endTime) return "unknown";
  const now = new Date();
  const start = new Date(stage.startTime);
  const end = new Date(stage.endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "unknown";
  if (now < start) return "upcoming";
  if (now >= start && now <= end) return "live";
  return "completed";
};

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Time when the event goes live (start time). Use this as the countdown target.
 *
 * With onlyWithin24Hours (student-facing): goesLiveAt is only returned when the event
 * starts within the next 24 hours (or has just started). Otherwise null so the client
 * doesn't show a distant countdown.
 *
 * @param {Object} item - Event with startTime/endTime or stages
 * @param {{ onlyWithin24Hours?: boolean }} [options] - If true, return null when start is more than 24h away or already past.
 * @returns {string|null} ISO date string, or null if no valid start or outside 24h window
 */
export const getGoesLiveAt = (item, options = {}) => {
  // For multi-stage events (tournaments): goesLiveAt should be the NEXT stage start (not the min start),
  // so we don't show "live" during gaps between stages.
  if (Array.isArray(item?.stages) && item.stages.length) {
    const now = new Date();
    const { stages } = getStagesTimeline(item);
    const liveStage = stages.find((s) => now >= s.start && now <= s.end);
    if (liveStage) return null; // already live (stage live) -> no countdown
    const nextStage = stages.find((s) => s.start > now);
    if (!nextStage) return null;
    const start = nextStage.start;
    if (options.onlyWithin24Hours) {
      if (now < start - TWENTY_FOUR_HOURS_MS) return null;
      if (now >= start) return null;
    }
    return start.toISOString();
  }

  const { start } = getEventStartEnd(item);
  if (!start || start.getTime() === 0) return null;

  if (options.onlyWithin24Hours) {
    const now = new Date();
    if (now < start - TWENTY_FOUR_HOURS_MS) return null; // more than 24h before start
    if (now >= start) return null; // already started or ended
  }

  return start.toISOString();
};

/**
 * Get event status for Olympiads, Tournaments, and Workshops.
 *
 * Status flow:
 * - close: before registration starts
 * - open: during registration (registrationStartTime <= now <= registrationEndTime)
 * - After registration ends:
 *   - If user IS registered: registered → live → completed
 *   - If user is NOT registered: closed
 *   - Admin view (no user): closed → live → completed
 *
 * @param {Object} item - Event with registrationStartTime, registrationEndTime, startTime/endTime (or stages)
 * @param {boolean} [isRegistered] - Whether the current user is registered. Omit for admin view.
 * @returns {string} - "close" | "open" | "closed" | "registered" | "live" | "completed"
 */
export const getEventStatus = (item, isRegistered) => {
  const now = new Date();
  const regStart = new Date(item.registrationStartTime);
  const regEnd = new Date(item.registrationEndTime);
  const { start, end } = getEventStartEnd(item);
  const hasStages = Array.isArray(item?.stages) && item.stages.length > 0;
  const timeline = hasStages ? getStagesTimeline(item) : null;
  const anyStageLive = hasStages
    ? timeline.stages.some((s) => now >= s.start && now <= s.end)
    : false;

  if (now < regStart) return "close";
  if (now >= regStart && now <= regEnd) return "open";

  // After registration period ended
  if (now > regEnd) {
    if (isRegistered === true) {
      if (hasStages) {
        if (anyStageLive) return "live";
        if (now < timeline.firstStart) return "registered";
        if (now > timeline.lastEnd) return "completed";
        // Between stages gap
        return "registered";
      }
      if (now < start) return "registered";
      if (now >= start && now <= end) return "live";
      return "completed";
    }
    // Not registered, or admin view (no user context)
    if (hasStages) {
      if (anyStageLive) return "live";
      if (now < timeline.firstStart) return "closed";
      if (now > timeline.lastEnd) return "completed";
      // Between stages gap
      return "closed";
    }
    if (now < start) return "closed";
    if (now >= start && now <= end) return "live";
    return "completed";
  }

  return "close";
};

/**
 * Add status and related flags to an event item.
 * For admin: use getEventStatus(item).
 * For student: use getEventStatus(item, isRegistered) and add isRegistrationOpen, isEventLive, canJoin.
 */
export const withEventStatus = (item, isRegistered) => {
  const obj = item?.toObject ? item.toObject() : { ...item };
  const now = new Date();
  const regStart = new Date(obj.registrationStartTime);
  const regEnd = new Date(obj.registrationEndTime);
  const { start, end } = getEventStartEnd(obj);
  const hasStages = Array.isArray(obj?.stages) && obj.stages.length > 0;
  const timeline = hasStages ? getStagesTimeline(obj) : null;
  const anyStageLive = hasStages
    ? timeline.stages.some((s) => now >= s.start && now <= s.end)
    : false;

  obj.status = getEventStatus(obj, isRegistered);
  obj.isRegistrationOpen = now >= regStart && now <= regEnd;
  obj.isEventLive = hasStages ? anyStageLive : now >= start && now <= end;
  obj.canJoin = isRegistered === true && obj.isEventLive;
  obj.goesLiveAt = getGoesLiveAt(obj, { onlyWithin24Hours: true });

  return obj;
};
