import { audienceAvatar, audienceTone } from "../../lib/audiences";
import { audienceImageUrl } from "../../lib/avatar-assets";

export function AudienceAvatar({
  id,
  size = "md",
}: {
  id: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const imageUrl = audienceImageUrl(id);
  return (
    <span
      className="audience-avatar"
      data-tone={audienceTone(id)}
      data-size={size}
      aria-hidden="true"
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" decoding="async" draggable={false} />
      ) : (
        audienceAvatar(id)
      )}
    </span>
  );
}
