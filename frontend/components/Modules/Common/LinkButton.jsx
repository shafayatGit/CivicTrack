import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * A button that navigates.
 *
 * Base UI's Button assumes it renders a native <button> and warns in the console
 * when it does not. An anchor already carries its own semantics, so `nativeButton`
 * has to be turned off explicitly — and doing that here means the next screen that
 * needs a link-shaped button gets it right without knowing the rule.
 *
 * Every visual prop is passed through, so this is a Button with a different
 * rendered element, not a second button style.
 */
const LinkButton = ({ href, className, variant, size, children, ...props }) => (
  <Button
    render={<Link href={href} />}
    nativeButton={false}
    className={className}
    variant={variant}
    size={size}
    {...props}
  >
    {children}
  </Button>
);

export default LinkButton;
