use super::CatalogSource;

const P4_ROUTING_SOURCE: CatalogSource = CatalogSource {
    name: "p4_exception_catalog",
    citation: "Miller–Valkov–Abel 2026 p=4 exceptional totals",
};

const P4_RBIBD_SOURCE: CatalogSource = CatalogSource {
    name: "p4_resolvable_bibd_family",
    citation: "Beth, Jungnickel, Lenz 1999, Design Theory (2nd ed.), Vol. 1, VII.7.5(a): resolvable (v,4,1)-BIBD for v = 3q + 1 with q a prime power",
};

const P4_RGDD_GROUP_SIZE_2_EXCEPTIONS: &[usize] =
    &[8, 20, 92, 140, 164, 188, 200, 236, 260, 404, 428];

pub(crate) fn rgdd_group_size_2_exception_totals() -> &'static [usize] {
    P4_RGDD_GROUP_SIZE_2_EXCEPTIONS
}

pub(crate) fn source() -> CatalogSource {
    P4_ROUTING_SOURCE
}

pub(crate) fn rbibd_source() -> CatalogSource {
    P4_RBIBD_SOURCE
}
