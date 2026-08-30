#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, Symbol, Vec};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum Error {
    Unauthorized = 1,
    ContractPaused = 2,
    MaxEventsReached = 3,
    ContractNotFound = 4,
    AlreadyRegistered = 5,
    Overflow = 6,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin = 0,
    Paused = 1,
    MaxEvents = 2,
    /// Counter of live registrations; kept in instance storage for pagination.
    RegistrationCount = 3,
    /// Per-contract registration record, stored in persistent storage under
    /// its own entry keyed by the contract's `Symbol`. This keeps reads O(1)
    /// and avoids deserializing (and eventually outgrowing) a single map.
    Registration(Symbol) = 4,
    Events = 5,
}

#[contracttype]
#[derive(Clone)]
pub struct ContractRecord {
    pub registrant: Address,
    pub contract_id: Symbol,
    pub active: bool,
}

#[contract]
pub struct ContractRegistry;

/// TTL handling for per-registration persistent entries, mirroring how the
/// escrow contract keeps match records alive.
const REGISTRATION_TTL_LEDGERS: u32 = 100_000;
const REGISTRATION_TTL_BUMP: u32 = 50_000;

#[contractimpl]
impl ContractRegistry {
    pub fn initialize(env: Env, admin: Address, max_events: u32) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::Unauthorized);
        }

        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage().instance().set(&DataKey::MaxEvents, &max_events);
        env.storage()
            .instance()
            .set(&DataKey::RegistrationCount, &0u32);
        env.storage().instance().set(&DataKey::Events, &Vec::<Symbol>::new(&env));

        Ok(())
    }

    pub fn pause(env: Env, caller: Address) -> Result<(), Error> {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).ok_or(Error::Unauthorized)?;
        if admin != caller {
            return Err(Error::Unauthorized);
        }
        caller.require_auth();
        env.storage().instance().set(&DataKey::Paused, &true);
        Ok(())
    }

    pub fn unpause(env: Env, caller: Address) -> Result<(), Error> {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).ok_or(Error::Unauthorized)?;
        if admin != caller {
            return Err(Error::Unauthorized);
        }
        caller.require_auth();
        env.storage().instance().set(&DataKey::Paused, &false);
        Ok(())
    }

    pub fn register_contract(env: Env, caller: Address, contract_id: Symbol) -> Result<(), Error> {
        Self::ensure_not_paused(&env)?;
        let admin: Address = env.storage().instance().get(&DataKey::Admin).ok_or(Error::Unauthorized)?;
        if admin != caller {
            return Err(Error::Unauthorized);
        }
        caller.require_auth();

        let key = DataKey::Registration(contract_id.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadyRegistered);
        }

        env.storage().persistent().set(
            &key,
            &ContractRecord {
                registrant: caller.clone(),
                contract_id: contract_id.clone(),
                active: true,
            },
        );
        env.storage().persistent().extend_ttl(
            &key,
            REGISTRATION_TTL_LEDGERS,
            REGISTRATION_TTL_BUMP,
        );

        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::RegistrationCount)
            .unwrap_or(0);
        let count = count.checked_add(1).ok_or(Error::Overflow)?;
        env.storage()
            .instance()
            .set(&DataKey::RegistrationCount, &count);
        Ok(())
    }

    pub fn update_contract(env: Env, caller: Address, contract_id: Symbol) -> Result<(), Error> {
        Self::ensure_not_paused(&env)?;
        let admin: Address = env.storage().instance().get(&DataKey::Admin).ok_or(Error::Unauthorized)?;
        if admin != caller {
            return Err(Error::Unauthorized);
        }
        caller.require_auth();

        let key = DataKey::Registration(contract_id.clone());
        if !env.storage().persistent().has(&key) {
            return Err(Error::ContractNotFound);
        }
        Ok(())
    }

    pub fn deregister_contract(env: Env, caller: Address, contract_id: Symbol) -> Result<(), Error> {
        Self::ensure_not_paused(&env)?;
        let key = DataKey::Registration(contract_id.clone());
        let record: ContractRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ContractNotFound)?;
        let is_registrant = record.registrant == caller;
        if !is_registrant {
            let admin: Address = env.storage().instance().get(&DataKey::Admin).ok_or(Error::Unauthorized)?;
            if admin != caller {
                return Err(Error::Unauthorized);
            }
        }
        caller.require_auth();
        env.storage().persistent().remove(&key);

        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::RegistrationCount)
            .unwrap_or(0);
        let count = count.saturating_sub(1);
        env.storage()
            .instance()
            .set(&DataKey::RegistrationCount, &count);
        Ok(())
    }

    /// Number of live registrations. Use this to bound pagination loops.
    pub fn registration_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::RegistrationCount)
            .unwrap_or(0)
    }

    /// Fetch a single registration without deserializing the whole registry.
    pub fn get_registration(env: Env, contract_id: Symbol) -> Result<ContractRecord, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Registration(contract_id))
            .ok_or(Error::ContractNotFound)
    }

    pub fn submit_event(env: Env, caller: Address, event_name: Symbol) -> Result<(), Error> {
        Self::ensure_not_paused(&env)?;
        caller.require_auth();
        let max_events: u32 = env.storage().instance().get(&DataKey::MaxEvents).unwrap_or(0);
        let mut events: Vec<Symbol> = env
            .storage()
            .instance()
            .get(&DataKey::Events)
            .unwrap_or_else(|| Vec::new(&env));
        if events.len() >= max_events {
            return Err(Error::MaxEventsReached);
        }
        events.push_back(event_name);
        env.storage().instance().set(&DataKey::Events, &events);
        Ok(())
    }

    fn ensure_not_paused(env: &Env) -> Result<(), Error> {
        let paused: bool = env.storage().instance().get(&DataKey::Paused).unwrap_or(false);
        if paused {
            return Err(Error::ContractPaused);
        }
        Ok(())
    }
}

#[cfg(test)]
mod test;
