//! Move operations for the solver.
//!
//! This module contains implementations for the three types of moves:
//! - **Swap**: Exchange two people between groups in a session
//! - **Clique Swap**: Move an entire clique to a different group
//! - **Transfer**: Move a person to a group with available capacity

mod clique_swap;
mod swap;
mod transfer;
