// One self-contained trial record per participant; retained as an array for DataPipe.
export function exportRows(session, stimuli, config) {
  return session.trials.map(t=>{
    const map=stimuli.maps[t.condition.map_id];
    return {...t,schema_version:3,session_id:session.id,study_version:session.study_version,
      design:'between_participants',is_test:Boolean(session.is_test || session.preview),assignment:session.assignment,
      experiment_id:config.experimentId,prolific:session.prolific,participant_id:session.participant_id,
      completed_at:session.completed_at || null,session_started_at:session.started_at,
      page_opened_at:session.page_opened_at,instruction_reading_ms:session.instruction_reading_ms,assignment_wait_ms:session.assignment_wait_ms,
      capabilities:stimuli.profiles[t.condition.profile_id],max_actions:config.maxActions,
      source_library_sha256:stimuli.source_library_sha256,
      coordinate_system:'[x,y], zero-based; x increases east, y increases south',
      map_snapshot:{width:map.width,height:map.height,tiles:map.tiles,start:map.start,goal:map.goal,objects:map.objects},
      browser_events:session.browser_events,
      display:{current_fov_only:t.condition.fov_radius!==null,persistent_instructions:true}};
  });
}
