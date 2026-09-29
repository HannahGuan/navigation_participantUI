export const CONFIG = Object.freeze({
  studyVersion: 'navigation-human-2026-09-27-between-v4',
  experimentId: 'elWePWHpMmnZ',
  completionUrl: 'https://app.prolific.com/submissions/complete?cc=CSQGOE1Y',
  // Existing five demo_contrast cases retained at the researcher's request.
  collectionEnabled: true,
  maxActions: 400,
  plannedParticipants: 15,
  targetPerCondition: 3,
  estimatedMinutes: 3,
  // null uses the original five comparison cases from demo_contrast.py.
  // Explicit conditions: [{id, map_id, profile_id, instruction, fov_radius, prior_knowledge}].
  // fov_radius:null means full visibility; prior_knowledge:'all' reveals the initial map.
  conditions: null,
  // Temporary top-up collection: lake1 with suitable directions (original index 3).
  // Set null to restore DataPipe assignment across all five conditions.
  fixedConditionId: '4_lake1_suitable',
});
