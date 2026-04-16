use super::CatalogSource;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct PrimePowerFieldSpec {
    pub(crate) order: usize,
    pub(crate) prime: usize,
    pub(crate) degree: usize,
    pub(crate) modulus: &'static [usize],
    pub(crate) source: CatalogSource,
}

const FINITE_FIELD_SOURCE: CatalogSource = CatalogSource {
    name: "supported_prime_power_fields",
    citation: "solver5 finite-field support catalog",
};

const SUPPORTED_FIELDS: &[PrimePowerFieldSpec] = &[
    PrimePowerFieldSpec {
        order: 2,
        prime: 2,
        degree: 1,
        modulus: &[1, 0],
        source: FINITE_FIELD_SOURCE,
    },
    PrimePowerFieldSpec {
        order: 3,
        prime: 3,
        degree: 1,
        modulus: &[1, 0],
        source: FINITE_FIELD_SOURCE,
    },
    PrimePowerFieldSpec {
        order: 4,
        prime: 2,
        degree: 2,
        modulus: &[1, 1, 1],
        source: FINITE_FIELD_SOURCE,
    },
    PrimePowerFieldSpec {
        order: 5,
        prime: 5,
        degree: 1,
        modulus: &[1, 0],
        source: FINITE_FIELD_SOURCE,
    },
    PrimePowerFieldSpec {
        order: 7,
        prime: 7,
        degree: 1,
        modulus: &[1, 0],
        source: FINITE_FIELD_SOURCE,
    },
    PrimePowerFieldSpec {
        order: 8,
        prime: 2,
        degree: 3,
        modulus: &[1, 1, 0, 1],
        source: FINITE_FIELD_SOURCE,
    },
    PrimePowerFieldSpec {
        order: 9,
        prime: 3,
        degree: 2,
        modulus: &[1, 0, 1],
        source: FINITE_FIELD_SOURCE,
    },
];

pub(crate) fn supported_field(order: usize) -> Option<PrimePowerFieldSpec> {
    SUPPORTED_FIELDS
        .iter()
        .copied()
        .find(|field| field.order == order)
}

pub(crate) fn supported_orders() -> &'static [PrimePowerFieldSpec] {
    SUPPORTED_FIELDS
}
