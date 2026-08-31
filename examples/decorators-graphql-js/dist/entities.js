// Model metadata declared with super-join decorators.
//
// Classes carry the model: `@Entity` names the backing table, `@Field` declares
// columns (with `text` for strings), and `@Relation(() => Post, ...)` declares
// the join. Ids are pinned explicitly so hooks can reference columns by the
// same constants; omit them and `modelFromClasses` assigns ids automatically.
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Entity, Field, Relation } from 'super-join/decorators';
export const USER_ENTITY_ID = 0n;
export const POST_ENTITY_ID = 1n;
export const USER_ID = 0n;
export const USER_NAME = 1n;
export const POST_ID = 2n;
export const POST_AUTHOR_ID = 3n;
export const POST_VIEWS = 4n;
let User = class User {
    id;
    // `text` is a first-class scalar type: string columns are selectable.
    name;
    posts;
};
__decorate([
    Field({ id: USER_ID, dataType: 'int64', identity: true })
], User.prototype, "id", void 0);
__decorate([
    Field({ id: USER_NAME, dataType: 'text' })
], User.prototype, "name", void 0);
__decorate([
    Relation(() => Post, {
        cardinality: 'many',
        key: { from: 'id', to: 'authorId' },
        hooks: {
            // Tenant-scoping-style filter fed from the GraphQL server's own context:
            // MIN_VIEWS=5 makes every `posts` selection only match views > 5.
            where: ({ expr, context }) => {
                const minViews = Number(context.minViews ?? 0);
                if (!Number.isFinite(minViews) || minViews <= 0)
                    return undefined;
                return expr.gt(expr.column(POST_VIEWS), expr.literal(Math.trunc(minViews), 'int64'));
            },
        },
    })
], User.prototype, "posts", void 0);
User = __decorate([
    Entity({ id: USER_ENTITY_ID, source: ['users'] })
], User);
export { User };
let Post = class Post {
    id;
    // Not selectable: it can never leak into a GraphQL response. The physical
    // column is snake_case, so name it explicitly (the property is camelCase).
    authorId;
    views;
};
__decorate([
    Field({ id: POST_ID, dataType: 'int64', identity: true })
], Post.prototype, "id", void 0);
__decorate([
    Field({ id: POST_AUTHOR_ID, column: 'author_id', dataType: 'int64', selectable: false })
], Post.prototype, "authorId", void 0);
__decorate([
    Field({ id: POST_VIEWS, dataType: 'int64' })
], Post.prototype, "views", void 0);
Post = __decorate([
    Entity({ id: POST_ENTITY_ID, source: ['posts'] })
], Post);
export { Post };
