use super::CatalogSource;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct NktsCatalogEntry {
    pub(crate) num_groups: usize,
    pub(crate) alphabet: &'static str,
    pub(crate) encoded_weeks: &'static [&'static [&'static str]],
    pub(crate) citation: &'static str,
}

const NKTS_SOURCE: CatalogSource = CatalogSource {
    name: "nkts_catalog",
    citation: "Kotzig–Rosa 1974 nearly Kirkman systems; explicit NKTS(18) schedule as reproduced by Ed Pegg Jr., Math Games (2007)",
};

const NKTS_18_WEEKS: &[&[&str]] = &[
    &["ABC", "DEF", "GHI", "ahf", "dbi", "gec"],
    &["Abc", "Def", "Ghi", "aHF", "dBI", "gEC"],
    &["abC", "deF", "ghI", "AHf", "DBi", "GEc"],
    &["aBc", "dEf", "gHi", "AhF", "DbI", "GeC"],
    &["ADG", "BEH", "CFI", "aei", "bfg", "cdh"],
    &["Adg", "Beh", "Cfi", "aEI", "bFG", "cDH"],
    &["adG", "beH", "cfI", "AEi", "BFg", "CDh"],
    &["aDg", "bEh", "cFi", "AeI", "BfG", "CdH"],
];

const NKTS_CASES: &[NktsCatalogEntry] = &[NktsCatalogEntry {
    num_groups: 6,
    alphabet: "ABCDEFGHIabcdefghi",
    encoded_weeks: NKTS_18_WEEKS,
    citation: "NKTS(18) explicit schedule from Ed Pegg Jr., Math Games (2007), citing Kotzig–Rosa/Rees–Wallis",
}];

pub(crate) fn exact_case(num_groups: usize) -> Option<&'static NktsCatalogEntry> {
    NKTS_CASES.iter().find(|entry| entry.num_groups == num_groups)
}

pub(crate) fn source() -> CatalogSource {
    NKTS_SOURCE
}
