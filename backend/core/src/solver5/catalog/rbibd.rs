use super::CatalogSource;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct RbibdCatalogEntry {
    pub(crate) num_groups: usize,
    pub(crate) group_size: usize,
    pub(crate) source_order: usize,
    pub(crate) base_block: &'static [usize],
    pub(crate) hyperoval: &'static [usize],
    pub(crate) pivot_hyperoval_point: usize,
    pub(crate) citation: &'static str,
}

const RBIBD_SOURCE: CatalogSource = CatalogSource {
    name: "rbibd_catalog",
    citation: "Catalog-backed resolvable BIBD bank derived from explicit Sage combinatorial-designs database constructions",
};

const RBIBD_120_8_1_BASE_BLOCK: &[usize] = &[
    1, 2, 4, 8, 16, 32, 64, 91, 117, 128, 137, 182, 195, 205, 234, 239, 256,
];

const RBIBD_120_8_1_HYPEROVAL: &[usize] = &[
    128, 192, 194, 4, 262, 140, 175, 48, 81, 180, 245, 271, 119, 212, 249, 189, 62, 255,
];

const CASES: &[RbibdCatalogEntry] = &[RbibdCatalogEntry {
    num_groups: 15,
    group_size: 8,
    source_order: 273,
    base_block: RBIBD_120_8_1_BASE_BLOCK,
    hyperoval: RBIBD_120_8_1_HYPEROVAL,
    pivot_hyperoval_point: 128,
    citation: "RBIBD(120,8,1) construction shared by Julian R. Abel in the Sage combinatorial-designs database, using Seiden's method from a cyclic (273,17,1)-BIBD and hyperoval dualization",
}];

pub(crate) fn source() -> &'static CatalogSource {
    &RBIBD_SOURCE
}

pub(crate) fn exact_case(num_groups: usize, group_size: usize) -> Option<&'static RbibdCatalogEntry> {
    CASES
        .iter()
        .find(|entry| entry.num_groups == num_groups && entry.group_size == group_size)
}
