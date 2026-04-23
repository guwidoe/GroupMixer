pub(super) mod kts;
pub(super) mod molr;
pub(super) mod mols;
pub(super) mod nkts;
pub(super) mod ownsg;
pub(super) mod p4;
pub(super) mod prime_powers;
pub(super) mod published;
pub(super) mod qdm;
pub(super) mod rbibd;
pub(super) mod ritd;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct CatalogSource {
    pub(crate) name: &'static str,
    pub(crate) citation: &'static str,
}
