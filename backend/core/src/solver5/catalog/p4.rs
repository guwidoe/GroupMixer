use super::CatalogSource;

const P4_ROUTING_SOURCE: CatalogSource = CatalogSource {
    name: "p4_exception_catalog",
    citation: "Miller–Valkov–Abel 2026 p=4 exceptional totals",
};

const P4_RGDD_GROUP_SIZE_2_EXCEPTIONS: &[usize] =
    &[8, 20, 92, 140, 164, 188, 200, 236, 260, 404, 428];

pub(crate) fn rgdd_group_size_2_exception_totals() -> &'static [usize] {
    P4_RGDD_GROUP_SIZE_2_EXCEPTIONS
}

pub(crate) fn source() -> CatalogSource {
    P4_ROUTING_SOURCE
}
