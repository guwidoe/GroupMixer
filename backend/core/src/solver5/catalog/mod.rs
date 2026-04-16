pub(super) mod nkts;
pub(super) mod ownsg;
pub(super) mod p4;
pub(super) mod prime_powers;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct CatalogSource {
    pub(crate) name: &'static str,
    pub(crate) citation: &'static str,
}
