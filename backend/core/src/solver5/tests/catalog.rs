use crate::solver5::catalog::{nkts, ownsg, p4, prime_powers};

#[test]
fn prime_power_catalog_exposes_supported_field_orders() {
    let orders = prime_powers::supported_orders()
        .iter()
        .map(|spec| spec.order)
        .collect::<Vec<_>>();

    assert_eq!(orders, vec![2, 3, 4, 5, 7, 8, 9]);
}

#[test]
fn p4_catalog_exposes_exception_totals() {
    assert!(p4::rgdd_group_size_2_exception_totals().contains(&20));
    assert_eq!(p4::source().name, "p4_exception_catalog");
}

#[test]
fn nkts_catalog_exposes_exact_18_case() {
    let case = nkts::exact_case(6).expect("nkts catalog should expose the 18-player case");

    assert_eq!(case.encoded_weeks.len(), 8);
    assert_eq!(nkts::source().name, "nkts_catalog");
}

#[test]
fn ownsg_catalog_starts_as_explicit_empty_patch_bank() {
    assert!(ownsg::patch_bank().is_empty());
    assert_eq!(ownsg::source().name, "ownsg_patch_bank");
}
