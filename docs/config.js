export const CONFIG = Object.freeze({
  studyVersion: 'navigation-human-2026-09-27-v2',
  experimentId: 'elWePWHpMmnZ',
  completionUrl: 'https://app.prolific.com/submissions/complete?cc=CSQGOE1Y',
  // Existing five demo_contrast cases retained at the researcher's request.
  collectionEnabled: true,
  maxActions: 400,
  // null uses the original five comparison cases from demo_contrast.py.
  // Explicit conditions: [{id, map_id, profile_id, instruction, fov_radius, prior_knowledge}].
  // fov_radius:null means full visibility; prior_knowledge:'all' reveals the initial map.
  conditions: null,
});
