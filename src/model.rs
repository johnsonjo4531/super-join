//! Model: a declarative description of the data the compiler may query.
//!
//! The model separates database knowledge from any frontend schema. It never
//! contains a database connection, an ORM instance, an executable callback, or
//! rendered SQL; dynamic behavior belongs to frontend hooks.

/// Declared scalar type of a model field or parameter value.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(non_camel_case_types)]
pub enum ScalarType {
    Null,
    Bool,
    Int8,
    Int16,
    Int32,
    Int64,
    Uint8,
    Uint16,
    Uint32,
    Uint64,
    Float32,
    Float64,
    Decimal,
    Date,
    Time,
    TimeTz,
    Timestamp,
    TimestampTz,
    Uuid,
    Jsonb,
}

impl ScalarType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ScalarType::Null => "null",
            ScalarType::Bool => "bool",
            ScalarType::Int8 => "int8",
            ScalarType::Int16 => "int16",
            ScalarType::Int32 => "int32",
            ScalarType::Int64 => "int64",
            ScalarType::Uint8 => "uint8",
            ScalarType::Uint16 => "uint16",
            ScalarType::Uint32 => "uint32",
            ScalarType::Uint64 => "uint64",
            ScalarType::Float32 => "float32",
            ScalarType::Float64 => "float64",
            ScalarType::Decimal => "decimal",
            ScalarType::Date => "date",
            ScalarType::Time => "time",
            ScalarType::TimeTz => "time-tz",
            ScalarType::Timestamp => "timestamp",
            ScalarType::TimestampTz => "timestamp-tz",
            ScalarType::Uuid => "uuid",
            ScalarType::Jsonb => "jsonb",
        }
    }
}

/// A dotted identifier expressed as ordered components (never a raw SQL fragment).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Identifier {
    pub components: Vec<String>,
}

impl Identifier {
    pub fn new(components: impl IntoIterator<Item = String>) -> Self {
        Identifier {
            components: components.into_iter().collect(),
        }
    }

    pub fn dotted(&self) -> String {
        self.components.join(".")
    }
}

/// Metadata describing one scalar field of an entity.
#[derive(Debug, Clone)]
pub struct FieldMetadata {
    pub id: u64,
    pub identifier: Identifier,
    pub type_: ScalarType,
    pub nullable: bool,
    pub selectable: bool,
}

/// Cardinality of a relation endpoint.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cardinality {
    One,
    Many,
}

/// Metadata describing one relation between two entities.
#[derive(Debug, Clone)]
pub struct RelationMetadata {
    pub id: u64,
    pub target: u64,
    pub cardinality: Cardinality,
    /// Join condition evaluated in the context where the left operand is a
    /// `ParentColumn` reference to the defining entity and the right operand is
    /// a `Column` reference to the target entity.
    pub join: crate::expression::Expression,
}

/// Metadata describing one root entity. `source` names the backing table(s).
#[derive(Debug, Clone)]
pub struct EntityMetadata {
    pub id: u64,
    pub source: Identifier,
    pub fields: Vec<FieldMetadata>,
    pub relations: Vec<RelationMetadata>,
}

/// The complete set of entities that make up a request model.
#[derive(Debug, Clone)]
pub struct Model {
    pub entities: Vec<EntityMetadata>,
}
