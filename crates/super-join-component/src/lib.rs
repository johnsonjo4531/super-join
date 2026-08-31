//! The WIT component boundary for super-join.
//!
//! This crate is a thin adapter over the canonical compiler in
//! `super-join-core`. All bindings code lives in the wasm-only `adapter`
//! module so the crate still builds (as an empty library) for host targets.

#[cfg(target_arch = "wasm32")]
mod adapter;
