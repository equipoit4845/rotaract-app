import {
  Button,
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "@mirotaract/ui";

import { cx } from "../lib/cx";

export type OrganizationOption = { id: string; name: string };

export type OrganizationSwitcherProps = {
  organizations: OrganizationOption[];
  activeOrganizationId: string;
  onSelect: (organizationId: string) => void;
  placeholder?: string;
  className?: string;
};

export function OrganizationSwitcher({
  organizations,
  activeOrganizationId,
  onSelect,
  placeholder = "Seleccionar organización",
  className,
}: OrganizationSwitcherProps) {
  const active = organizations.find((org) => org.id === activeOrganizationId);

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cx("mr-organization-switcher__trigger", className)}
        >
          {active?.name ?? placeholder}
        </Button>
      </DropdownTrigger>
      <DropdownContent align="start">
        {organizations.map((org) => (
          <DropdownItem key={org.id} onSelect={() => onSelect(org.id)}>
            <span className="mr-organization-switcher__item-label">
              {org.name}
            </span>
            {org.id === activeOrganizationId ? (
              <span
                aria-hidden="true"
                className="mr-organization-switcher__check"
              >
                ✓
              </span>
            ) : null}
          </DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}
