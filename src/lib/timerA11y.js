/**
 * Timer accessibility helpers.
 *
 * The wipe countdown updates every animation frame, which would flood a
 * screen-reader live region if announced raw. These helpers reduce the
 * countdown to minute-resolution text so the live region only speaks when
 * the displayed minute changes.
 */

/**
 * Human-readable countdown text for the aria-live announcement.
 * @param {{ days: number, hours: number, minutes: number }} timeLeft
 */
export function formatCountdownAnnouncement({ days, hours, minutes }) {
	const d = Math.max(0, Math.trunc(days));
	const h = Math.max(0, Math.trunc(hours));
	const m = Math.max(0, Math.trunc(minutes));

	const part = (value, singular) => `${value} ${singular}${value === 1 ? '' : 's'}`;

	if (d === 0 && h === 0 && m === 0) {
		return 'Global wipe is due now';
	}

	const parts = [];
	if (d > 0) parts.push(part(d, 'day'));
	if (h > 0) parts.push(part(h, 'hour'));
	if (m > 0 || parts.length === 0) parts.push(part(m, 'minute'));

	return `${parts.join(', ')} until global wipe`;
}

/**
 * Stable key for the announcement: changes only when the displayed
 * day/hour/minute changes, never on seconds, so a live region updates
 * at most once per minute.
 * @param {{ days: number, hours: number, minutes: number }} timeLeft
 */
export function announcementKey({ days, hours, minutes }) {
	return `${Math.trunc(days)}:${Math.trunc(hours)}:${Math.trunc(minutes)}`;
}
