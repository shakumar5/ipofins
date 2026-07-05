import { howToForSlug } from './howto-schema';
import { buildWebAppSchema, type WebAppSchemaOpts } from './webapp-schema';

/** Combined WebApplication + HowTo JSON-LD array for tool pages. */
export function toolPageJsonLd(opts: WebAppSchemaOpts) {
  const schemas: object[] = [buildWebAppSchema(opts)];
  const howTo = howToForSlug(opts.slug);
  if (howTo) schemas.push(howTo);
  return schemas;
}
