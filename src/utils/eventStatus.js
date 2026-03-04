const getEventStartEnd = (item) => {
  if (item.startTime && item.endTime) {
    return { start: new Date(item.startTime), end: new Date(item.endTime) };
  }
  if (item.stages && item.stages.length) {
    const times = item.stages.flatMap((s) => [new Date(s.startTime), new Date(s.endTime)]);
    return {
      start: new Date(Math.min(...times)),
      end: new Date(Math.max(...times)),
    };
  }
  return { start: new Date(0), end: new Date(0) };
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

  if (now < regStart) return "close";
  if (now >= regStart && now <= regEnd) return "open";

  // After registration period ended
  if (now > regEnd) {
    if (isRegistered === true) {
      if (now < start) return "registered";
      if (now >= start && now <= end) return "live";
      return "completed";
    }
    // Not registered, or admin view (no user context)
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

  obj.status = getEventStatus(obj, isRegistered);
  obj.isRegistrationOpen = now >= regStart && now <= regEnd;
  obj.isEventLive = now >= start && now <= end;
  obj.canJoin = isRegistered === true && obj.isEventLive;
  obj.goesLiveAt = getGoesLiveAt(obj, { onlyWithin24Hours: true });

  return obj;
};
