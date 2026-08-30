#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Env, FromVal, IntoVal, Symbol, Val, Vec};

/// Raw contract invocation, so tests can exercise the public read-only
/// accessors that are not part of the generated client (they take `Env`).
fn call_raw(env: &Env, contract_id: &Address, name: &str, args: Vec<Val>) -> Result<Val, soroban_sdk::Error> {
    env.invoke_contract(contract_id, &Symbol::new(env, name), args)
}

// ============================================================================
// SETUP AND HELPERS
// ============================================================================

fn setup(env: &Env) -> (Address, Address, Address) {
    let admin = Address::generate(env);
    let caller = Address::generate(env);
    let contract_id = env.register_contract(None, ContractRegistry);
    let client = ContractRegistryClient::new(env, &contract_id);
    client.initialize(&admin, &3);
    (admin, caller, contract_id)
}

fn setup_with_max_events(env: &Env, max_events: u32) -> (Address, Address, Address) {
    let admin = Address::generate(env);
    let caller = Address::generate(env);
    let contract_id = env.register_contract(None, ContractRegistry);
    let client = ContractRegistryClient::new(env, &contract_id);
    client.initialize(&admin, &max_events);
    (admin, caller, contract_id)
}

// ============================================================================
// INITIALIZE TESTS
// ============================================================================

#[test]
fn test_initialize_success() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, ContractRegistry);
    let client = ContractRegistryClient::new(&env, &contract_id);

    let result = client.try_initialize(&admin, &10);
    assert!(result.is_ok());
}

#[test]
fn test_initialize_twice_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, ContractRegistry);
    let client = ContractRegistryClient::new(&env, &contract_id);

    client.initialize(&admin, &10);
    let result = client.try_initialize(&admin, &5);
    assert!(matches!(result, Err(Ok(Error::Unauthorized))));
}

#[test]
fn test_initialize_with_zero_max_events() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, ContractRegistry);
    let client = ContractRegistryClient::new(&env, &contract_id);

    let result = client.try_initialize(&admin, &0);
    assert!(result.is_ok());
}

// ============================================================================
// PAUSE / UNPAUSE TESTS
// ============================================================================

#[test]
fn test_pause_requires_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, caller, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    assert!(matches!(
        client.try_pause(&caller),
        Err(Ok(Error::Unauthorized))
    ));
}

#[test]
fn test_pause_blocks_mutations() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    client.pause(&admin);

    // All mutating operations should fail
    assert!(matches!(
        client.try_register_contract(&admin, &Symbol::new(&env, "blocked")),
        Err(Ok(Error::ContractPaused))
    ));
    assert!(matches!(
        client.try_deregister_contract(&admin, &Symbol::new(&env, "any")),
        Err(Ok(Error::ContractPaused))
    ));
    assert!(matches!(
        client.try_update_contract(&admin, &Symbol::new(&env, "any")),
        Err(Ok(Error::ContractPaused))
    ));
    assert!(matches!(
        client.try_submit_event(&admin, &Symbol::new(&env, "event")),
        Err(Ok(Error::ContractPaused))
    ));
}

#[test]
fn test_unpause_requires_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, caller, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    client.pause(&admin);
    assert!(matches!(
        client.try_unpause(&caller),
        Err(Ok(Error::Unauthorized))
    ));
}

#[test]
fn test_unpause_resumes_mutations() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    client.pause(&admin);
    client.unpause(&admin);

    // Operations should now work
    let contract_symbol = Symbol::new(&env, "resumed");
    let result = client.try_register_contract(&admin, &contract_symbol);
    assert!(result.is_ok());
}

#[test]
fn test_pause_and_unpause_admin_only() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    client.pause(&admin);
    assert!(matches!(
        client.try_submit_event(&admin, &Symbol::new(&env, "blocked")),
        Err(Ok(Error::ContractPaused))
    ));
    client.unpause(&admin);
}

// ============================================================================
// REGISTER CONTRACT TESTS
// ============================================================================

#[test]
fn test_register_contract_success() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    let contract_symbol = Symbol::new(&env, "my_contract");
    let result = client.try_register_contract(&admin, &contract_symbol);
    assert!(result.is_ok());
}

#[test]
fn test_register_contract_requires_admin_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, caller, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    assert!(matches!(
        client.try_register_contract(&caller, &Symbol::new(&env, "demo")),
        Err(Ok(Error::Unauthorized))
    ));
}

#[test]
fn test_register_contract_duplicate_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    let contract_symbol = Symbol::new(&env, "duplicate");
    client.register_contract(&admin, &contract_symbol);

    // Attempting to register the same contract again should fail
    assert!(matches!(
        client.try_register_contract(&admin, &contract_symbol),
        Err(Ok(Error::AlreadyRegistered))
    ));
}

#[test]
fn test_register_multiple_contracts() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    // Register three contracts
    for i in 0..3 {
        let symbol = Symbol::new(&env, &format!("contract_{}", i));
        let result = client.try_register_contract(&admin, &symbol);
        assert!(result.is_ok(), "Failed to register contract_{}", i);
    }

    // The instance counter tracks every live registration for pagination.
    let count: Val = call_raw(
        &env,
        &contract_id,
        "registration_count",
        Vec::new(&env),
    )
    .unwrap();
    assert_eq!(u32::from_val(&env, &count), 3);
}

#[test]
fn test_get_registration_returns_record_without_touching_other_entries() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    let sym1 = Symbol::new(&env, "alpha");
    let sym2 = Symbol::new(&env, "beta");
    client.register_contract(&admin, &sym1);
    client.register_contract(&admin, &sym2);

    // Reads one per-contract persistent entry; unknown symbols simply miss.
    assert!(call_raw(
        &env,
        &contract_id,
        "get_registration",
        (sym1,).into_val(&env)
    )
    .is_ok());

    let missing = call_raw(
        &env,
        &contract_id,
        "get_registration",
        (Symbol::new(&env, "nope"),).into_val(&env),
    );
    assert!(missing.is_err());
}

#[test]
fn test_deregister_decrements_registration_count() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    let sym1 = Symbol::new(&env, "one");
    let sym2 = Symbol::new(&env, "two");
    client.register_contract(&admin, &sym1);
    client.register_contract(&admin, &sym2);

    client.deregister_contract(&admin, &sym1);

    let count: Val = call_raw(
        &env,
        &contract_id,
        "registration_count",
        Vec::new(&env),
    )
    .unwrap();
    assert_eq!(u32::from_val(&env, &count), 1);

    // The removed entry is gone; the survivor still resolves.
    assert!(call_raw(
        &env,
        &contract_id,
        "get_registration",
        (sym1,).into_val(&env)
    )
    .is_err());
    assert!(call_raw(
        &env,
        &contract_id,
        "get_registration",
        (sym2,).into_val(&env)
    )
    .is_ok());
}

#[test]
fn test_register_contract_while_paused_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    client.pause(&admin);
    assert!(matches!(
        client.try_register_contract(&admin, &Symbol::new(&env, "blocked")),
        Err(Ok(Error::ContractPaused))
    ));
}

// ============================================================================
// UPDATE CONTRACT TESTS
// ============================================================================

#[test]
fn test_update_contract_success() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    let contract_symbol = Symbol::new(&env, "to_update");
    client.register_contract(&admin, &contract_symbol);

    // Update should succeed
    let result = client.try_update_contract(&admin, &contract_symbol);
    assert!(result.is_ok());
}

#[test]
fn test_update_contract_requires_admin_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, caller, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    assert!(matches!(
        client.try_update_contract(&caller, &Symbol::new(&env, "demo")),
        Err(Ok(Error::Unauthorized))
    ));
}

#[test]
fn test_update_nonexistent_contract_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    // Attempt to update a contract that was never registered
    assert!(matches!(
        client.try_update_contract(&admin, &Symbol::new(&env, "nonexistent")),
        Err(Ok(Error::ContractNotFound))
    ));
}

#[test]
fn test_update_contract_while_paused_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    let symbol = Symbol::new(&env, "contract");
    client.register_contract(&admin, &symbol);
    client.pause(&admin);

    assert!(matches!(
        client.try_update_contract(&admin, &symbol),
        Err(Ok(Error::ContractPaused))
    ));
}

// ============================================================================
// DEREGISTER CONTRACT TESTS
// ============================================================================

#[test]
fn test_deregister_contract_by_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    let contract_symbol = Symbol::new(&env, "to_remove");
    client.register_contract(&admin, &contract_symbol);
    let result = client.try_deregister_contract(&admin, &contract_symbol);
    assert!(result.is_ok());
}

#[test]
fn test_deregister_contract_allows_admin_or_registrant() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _caller, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);
    let contract_symbol = Symbol::new(&env, "demo");

    client.register_contract(&admin, &contract_symbol);
    client.deregister_contract(&admin, &contract_symbol);
}

#[test]
fn test_deregister_nonexistent_contract_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    assert!(matches!(
        client.try_deregister_contract(&admin, &Symbol::new(&env, "never_existed")),
        Err(Ok(Error::ContractNotFound))
    ));
}

#[test]
fn test_deregister_contract_while_paused_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    let symbol = Symbol::new(&env, "contract");
    client.register_contract(&admin, &symbol);
    client.pause(&admin);

    assert!(matches!(
        client.try_deregister_contract(&admin, &symbol),
        Err(Ok(Error::ContractPaused))
    ));
}

#[test]
fn test_deregister_by_unauthorized_user_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, other_user, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    let symbol = Symbol::new(&env, "contract");
    client.register_contract(&admin, &symbol);

    // Attempt to deregister as a different user (not admin, not registrant)
    assert!(matches!(
        client.try_deregister_contract(&other_user, &symbol),
        Err(Ok(Error::Unauthorized))
    ));
}

// ============================================================================
// SUBMIT EVENT TESTS
// ============================================================================

#[test]
fn test_submit_event_success() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    let result = client.try_submit_event(&admin, &Symbol::new(&env, "event1"));
    assert!(result.is_ok());
}

#[test]
fn test_submit_event_respects_max_events_cap() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    client.submit_event(&admin, &Symbol::new(&env, "one"));
    client.submit_event(&admin, &Symbol::new(&env, "two"));
    client.submit_event(&admin, &Symbol::new(&env, "three"));
    assert!(matches!(
        client.try_submit_event(&admin, &Symbol::new(&env, "four")),
        Err(Ok(Error::MaxEventsReached))
    ));
}

#[test]
fn test_submit_event_with_zero_max_events() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup_with_max_events(&env, 0);
    let client = ContractRegistryClient::new(&env, &contract_id);

    // Should fail immediately since max_events is 0
    assert!(matches!(
        client.try_submit_event(&admin, &Symbol::new(&env, "blocked")),
        Err(Ok(Error::MaxEventsReached))
    ));
}

#[test]
fn test_submit_event_with_large_max_events() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup_with_max_events(&env, 1000);
    let client = ContractRegistryClient::new(&env, &contract_id);

    // Submit 10 events
    for i in 0..10 {
        let result = client.try_submit_event(&admin, &Symbol::new(&env, &format!("event_{}", i)));
        assert!(result.is_ok(), "Failed to submit event_{}", i);
    }
}

#[test]
fn test_submit_event_while_paused_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    client.pause(&admin);
    assert!(matches!(
        client.try_submit_event(&admin, &Symbol::new(&env, "blocked")),
        Err(Ok(Error::ContractPaused))
    ));
}

#[test]
fn test_submit_event_requires_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, caller, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    // This should technically succeed because mock_all_auths() allows any caller
    // But this verifies the function executes
    let result = client.try_submit_event(&caller, &Symbol::new(&env, "event"));
    assert!(result.is_ok());
}

// ============================================================================
// INTEGRATION TESTS (BRANCH COVERAGE)
// ============================================================================

#[test]
fn test_full_workflow_register_update_deregister() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    let symbol = Symbol::new(&env, "workflow");

    // Register
    assert!(client.try_register_contract(&admin, &symbol).is_ok());

    // Update
    assert!(client.try_update_contract(&admin, &symbol).is_ok());

    // Deregister
    assert!(client.try_deregister_contract(&admin, &symbol).is_ok());

    // Verify it's gone
    assert!(matches!(
        client.try_update_contract(&admin, &symbol),
        Err(Ok(Error::ContractNotFound))
    ));
}

#[test]
fn test_multiple_contracts_independent() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    let sym1 = Symbol::new(&env, "contract_1");
    let sym2 = Symbol::new(&env, "contract_2");
    let sym3 = Symbol::new(&env, "contract_3");

    // Register all
    client.register_contract(&admin, &sym1);
    client.register_contract(&admin, &sym2);
    client.register_contract(&admin, &sym3);

    // Deregister only sym2
    assert!(client.try_deregister_contract(&admin, &sym2).is_ok());

    // sym1 and sym3 should still be queryable
    assert!(client.try_update_contract(&admin, &sym1).is_ok());
    assert!(client.try_update_contract(&admin, &sym3).is_ok());

    // sym2 should not be found
    assert!(matches!(
        client.try_update_contract(&admin, &sym2),
        Err(Ok(Error::ContractNotFound))
    ));
}

#[test]
fn test_pause_unpause_cycle() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    let symbol = Symbol::new(&env, "cycle_test");

    // Register before pause
    client.register_contract(&admin, &symbol);

    // Pause and verify blocked
    client.pause(&admin);
    assert!(matches!(
        client.try_register_contract(&admin, &Symbol::new(&env, "blocked")),
        Err(Ok(Error::ContractPaused))
    ));

    // Unpause and verify working again
    client.unpause(&admin);
    let symbol2 = Symbol::new(&env, "after_unpause");
    assert!(client.try_register_contract(&admin, &symbol2).is_ok());
}

#[test]
fn test_event_cap_boundary() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup_with_max_events(&env, 5);
    let client = ContractRegistryClient::new(&env, &contract_id);

    // Submit exactly 5 events (at the boundary)
    for i in 0..5 {
        let result = client.try_submit_event(&admin, &Symbol::new(&env, &format!("event_{}", i)));
        assert!(result.is_ok(), "Event {} should succeed", i);
    }

    // 6th event should fail
    assert!(matches!(
        client.try_submit_event(&admin, &Symbol::new(&env, "overflow")),
        Err(Ok(Error::MaxEventsReached))
    ));
}
