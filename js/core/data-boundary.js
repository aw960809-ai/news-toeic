/* V97 Data Boundary
 *
 * Diagnostic boundary only.
 * This module MUST NOT mutate application data.
 *
 * userData:
 *   belongs to one user/device/account.
 *
 * publicData:
 *   shared catalog / institution data.
 *
 * appConfig:
 *   application runtime configuration.
 */
(function () {
  'use strict';

  const USER_FIELDS = Object.freeze([
    'tasks',
    'logs',
    'calendarSelected',
    'calendarEvents',
    'executionPlans',
    'weekReviews',
  ]);

  const PUBLIC_FIELDS = Object.freeze([
    'activities',
    'scholarships',
    'schoolCalendar',
    'activitySource',
  ]);

  function isObject(value) {
    return !!value &&
      typeof value === 'object' &&
      !Array.isArray(value);
  }

  function selectFields(source, fields) {
    const src = isObject(source) ? source : {};
    const out = {};

    for (const key of fields) {
      if (
        Object.prototype.hasOwnProperty.call(src, key)
      ) {
        out[key] = src[key];
      }
    }

    return out;
  }

  function split(source) {
    return Object.freeze({
      userData: Object.freeze(
        selectFields(source, USER_FIELDS)
      ),

      publicData: Object.freeze(
        selectFields(source, PUBLIC_FIELDS)
      ),
    });
  }

  function emptyUserData() {
    return {
      tasks: [],
      logs: [],
      calendarSelected: '',
      calendarEvents: [],
      executionPlans: [],
      weekReviews: [],
    };
  }

  function getProfile() {
    if (
      window.GoalManagerRuntimeProfile &&
      typeof window.GoalManagerRuntimeProfile.get ===
        'function'
    ) {
      return window.GoalManagerRuntimeProfile.get();
    }

    return null;
  }

  function inspect(source) {
    const result = split(source);
    const profile = getProfile();

    return Object.freeze({
      profileId:
        profile && profile.id
          ? profile.id
          : 'unknown',

      profileKind:
        profile && profile.kind
          ? profile.kind
          : 'unknown',

      userFields:
        Object.keys(result.userData),

      publicFields:
        Object.keys(result.publicData),

      personalBootstrapAllowed:
        !!(
          profile &&
          profile.allowPersonalBootstrap === true
        ),
    });
  }

  window.GoalManagerDataBoundary = Object.freeze({
    USER_FIELDS,
    PUBLIC_FIELDS,
    emptyUserData,
    split,
    inspect,
  });
})();
