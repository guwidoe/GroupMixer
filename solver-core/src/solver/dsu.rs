//! Disjoint Set Union (Union-Find) data structure.
//!
//! Used for merging overlapping MustStayTogether constraints into unified cliques.

/// A Disjoint Set Union (Union-Find) data structure with path compression.
///
/// This is used during constraint preprocessing to merge overlapping
/// "must stay together" constraints into unified cliques.
pub struct Dsu {
    parent: Vec<usize>,
}

impl Dsu {
    /// Creates a new DSU with `n` elements, each in its own set.
    pub fn new(n: usize) -> Self {
        Dsu {
            parent: (0..n).collect(),
        }
    }

    /// Finds the representative (root) of the set containing element `i`.
    /// Uses path compression for efficiency.
    pub fn find(&mut self, i: usize) -> usize {
        if self.parent[i] == i {
            i
        } else {
            self.parent[i] = self.find(self.parent[i]);
            self.parent[i]
        }
    }

    /// Unites the sets containing elements `i` and `j`.
    pub fn union(&mut self, i: usize, j: usize) {
        let root_i = self.find(i);
        let root_j = self.find(j);
        if root_i != root_j {
            self.parent[root_i] = root_j;
        }
    }
}
