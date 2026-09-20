/* V97 Runtime Profile Boundary
 * Purpose:
 * - Core must not assume a specific person, school, exam or plan.
 * - Personal/public differences are provided through a runtime profile.
 */
(function () {
  'use strict';

  const DEFAULT_PROFILE = Object.freeze({
    id: 'generic',
    kind: 'generic',
    institution: null,
    allowPersonalBootstrap: false,
    features: Object.freeze({}),
  });

  function normalizeProfile(input) {
    const p =
      input && typeof input === 'object'
        ? input
        : {};

    return Object.freeze({
      id:
        typeof p.id === 'string' && p.id.trim()
          ? p.id.trim()
          : DEFAULT_PROFILE.id,

      kind:
        typeof p.kind === 'string' && p.kind.trim()
          ? p.kind.trim()
          : DEFAULT_PROFILE.kind,

      institution:
        p.institution && typeof p.institution === 'object'
          ? Object.freeze({ ...p.institution })
          : null,

      allowPersonalBootstrap:
        p.allowPersonalBootstrap === true,

      features: Object.freeze(
        p.features && typeof p.features === 'object'
          ? { ...p.features }
          : {}
      ),
    });
  }

  function getRuntimeProfile() {
    return normalizeProfile(
      window.GOAL_MANAGER_RUNTIME_PROFILE
    );
  }

  window.GoalManagerRuntimeProfile = Object.freeze({
    get: getRuntimeProfile,
    normalize: normalizeProfile,
    DEFAULT_PROFILE,
  });
})();
