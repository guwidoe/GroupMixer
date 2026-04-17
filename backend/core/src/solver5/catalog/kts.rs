use super::CatalogSource;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct KtsCatalogEntry {
    pub(crate) num_groups: usize,
    pub(crate) alphabet: &'static str,
    pub(crate) encoded_weeks: &'static [&'static [&'static str]],
    pub(crate) citation: &'static str,
}

const KTS_SOURCE: CatalogSource = CatalogSource {
    name: "kts_catalog",
    citation: "Explicit small Kirkman triple-system schedules as reproduced by Ed Pegg Jr., Math Games (2007)",
};

const KTS_9_WEEKS: &[&[&str]] = &[
    &["ABC", "DEF", "GHI"],
    &["AHF", "DBI", "GEC"],
    &["ADG", "BEH", "CFI"],
    &["AEI", "BFG", "CDH"],
];

const KTS_15_WEEKS: &[&[&str]] = &[
    &["ABC", "DEF", "GHI", "JKL", "MNO"],
    &["ADG", "BEJ", "CFM", "HKN", "ILO"],
    &["AEN", "BDO", "CHL", "FIK", "GJM"],
    &["AIM", "BGL", "CDK", "EHO", "FJN"],
    &["AHJ", "BKM", "CEI", "DLN", "FGO"],
    &["AFL", "BIN", "CJO", "DHM", "EGK"],
    &["AKO", "BFH", "CGN", "DIJ", "ELM"],
];

const KTS_CASES: &[KtsCatalogEntry] = &[
    KtsCatalogEntry {
        num_groups: 3,
        alphabet: "ABCDEFGHI",
        encoded_weeks: KTS_9_WEEKS,
        citation: "KTS(9) explicit schedule from Ed Pegg Jr., Math Games (2007)",
    },
    KtsCatalogEntry {
        num_groups: 5,
        alphabet: "ABCDEFGHIJKLMNO",
        encoded_weeks: KTS_15_WEEKS,
        citation: "KTS(15) explicit schedule from Ed Pegg Jr., Math Games (2007)",
    },
];

pub(crate) fn exact_case(num_groups: usize) -> Option<&'static KtsCatalogEntry> {
    KTS_CASES
        .iter()
        .find(|entry| entry.num_groups == num_groups)
}

pub(crate) fn source() -> CatalogSource {
    KTS_SOURCE
}
