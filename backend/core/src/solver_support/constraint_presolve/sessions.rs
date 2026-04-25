pub(crate) fn active_sessions(sessions: Option<&[usize]>, num_sessions: usize) -> Vec<usize> {
    sessions
        .map(|sessions| sessions.to_vec())
        .unwrap_or_else(|| (0..num_sessions).collect())
}
