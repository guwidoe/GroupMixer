use crate::solver5::catalog::{kts, molr, nkts, ownsg, p4, prime_powers, published, ritd};

#[test]
fn prime_power_catalog_exposes_supported_field_orders() {
    let orders = prime_powers::supported_orders()
        .iter()
        .map(|spec| spec.order)
        .collect::<Vec<_>>();

    assert_eq!(orders, vec![2, 3, 4, 5, 7, 8, 9, 11, 13, 16, 17, 19]);
}

#[test]
fn p4_catalog_exposes_exception_totals() {
    assert!(p4::rgdd_group_size_2_exception_totals().contains(&20));
    assert_eq!(p4::source().name, "p4_exception_catalog");
    assert_eq!(p4::rbibd_source().name, "p4_resolvable_bibd_family");
}

#[test]
fn kts_catalog_exposes_exact_small_cases() {
    assert_eq!(
        kts::exact_case(3)
            .expect("kts catalog should expose the 9-player case")
            .encoded_weeks
            .len(),
        4
    );
    assert_eq!(
        kts::exact_case(5)
            .expect("kts catalog should expose the 15-player case")
            .encoded_weeks
            .len(),
        7
    );
    assert_eq!(kts::source().name, "kts_catalog");
}

#[test]
fn nkts_catalog_exposes_exact_small_cases() {
    let case = nkts::exact_case(6).expect("nkts catalog should expose the 18-player case");
    assert_eq!(case.encoded_weeks.len(), 8);

    let case = nkts::exact_case(8).expect("nkts catalog should expose the 24-player case");
    assert_eq!(case.encoded_weeks.len(), 11);

    let case = nkts::exact_case(10).expect("nkts catalog should expose the 30-player case");
    assert_eq!(case.encoded_weeks.len(), 14);
    assert_eq!(nkts::source().name, "nkts_catalog");
}

#[test]
fn published_schedule_catalog_exposes_8_3_10_case() {
    let case = published::exact_case(8, 3)
        .expect("published schedule catalog should expose the 8-3-10 case");

    assert_eq!(case.encoded_weeks.len(), 10);
    assert_eq!(
        published::exact_case(8, 4)
            .expect("published schedule catalog should expose the 8-4-10 case")
            .encoded_weeks
            .len(),
        10
    );
    assert_eq!(
        published::exact_case(9, 4)
            .expect("published schedule catalog should expose the 9-4-11 case")
            .encoded_weeks
            .len(),
        11
    );
    assert_eq!(
        published::exact_case(10, 4)
            .expect("published schedule catalog should expose the 10-4-9 case")
            .encoded_weeks
            .len(),
        9
    );
    assert_eq!(
        published::exact_case(6, 4)
            .expect("published schedule catalog should expose the corrected 6-4-7 case")
            .encoded_weeks
            .len(),
        7
    );
    assert_eq!(
        published::exact_case(6, 5)
            .expect("published schedule catalog should expose the 6-5-6 case")
            .encoded_weeks
            .len(),
        6
    );
    assert_eq!(
        published::exact_case(10, 10)
            .expect("published schedule catalog should expose the 10-10-3 case")
            .encoded_weeks
            .len(),
        3
    );
    assert_eq!(published::source().name, "published_schedule_bank");
}

#[test]
fn ownsg_catalog_exposes_benchmark_relevant_cases() {
    assert_eq!(
        ownsg::exact_case(10, 6)
            .expect("ownsg catalog should expose the 10-6-7 case")
            .starter_blocks
            .len(),
        7
    );
    assert_eq!(
        ownsg::exact_case(10, 9)
            .expect("ownsg catalog should expose the 10-9-5 case")
            .starter_blocks
            .len(),
        5
    );
    assert_eq!(ownsg::source().name, "ownsg_catalog");
}

#[test]
fn ritd_catalog_exposes_10_5_case() {
    let case = ritd::exact_case(10, 5).expect("ritd catalog should expose the 10-5 case");

    assert_eq!(case.complete_parallel_classes, 8);
    assert!(case.add_group_fill_week);
    assert_eq!(ritd::source().name, "ritd_catalog");
}

#[test]
fn molr_catalog_exposes_10_10_case() {
    let case = molr::exact_case(10, 10).expect("molr catalog should expose the 10-10 case");

    assert_eq!(case.base_weeks, 3);
    assert_eq!(case.group_fill_week.len(), 10);
    assert_eq!(molr::source().name, "molr_catalog");
}
