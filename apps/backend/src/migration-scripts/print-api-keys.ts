import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

export default async function print_api_keys({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  logger.info("Fetching publishable API keys...");
  const { data: apiKeys } = await query.graph({
    entity: "api_key",
    fields: ["id", "title", "token", "type"],
  });

  logger.info("Found API keys: " + JSON.stringify(apiKeys, null, 2));
}
