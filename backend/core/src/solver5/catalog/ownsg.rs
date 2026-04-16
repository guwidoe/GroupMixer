use super::CatalogSource;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct OwnSgPatchEntry {
    pub(crate) total_players: usize,
    pub(crate) group_size: usize,
    pub(crate) supported_weeks: usize,
    pub(crate) label: &'static str,
}

const OWNSG_SOURCE: CatalogSource = CatalogSource {
    name: "ownsg_patch_bank",
    citation: "placeholder ownSG starter-block bank catalog",
};

const PATCH_BANK: &[OwnSgPatchEntry] = &[];

pub(crate) fn patch_bank() -> &'static [OwnSgPatchEntry] {
    PATCH_BANK
}

pub(crate) fn source() -> CatalogSource {
    OWNSG_SOURCE
}
