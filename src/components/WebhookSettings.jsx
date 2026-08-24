import { useState } from "react";

function WebhookSettings() {
  const baseUrl = window.location.origin;
  const webhookUrl = `${baseUrl}/api/webhooks/github`;
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#111] border border-[#232323] rounded-xl p-4">
      <h3 className="text-sm font-semibold mb-3">GitHub Webhook</h3>
      <p className="text-[12px] text-[#9d9d9d] mb-3">
        Nastav webhook v repository Settings → Webhooks → Add webhook.
      </p>

      <div className="space-y-3">
        <div>
          <label className="text-[11px] text-[#5c5c5c] uppercase tracking-wider">Payload URL</label>
          <div className="flex gap-2 mt-1">
            <input
              readOnly
              value={webhookUrl}
              className="flex-1 bg-[#0a0a0a] border border-[#232323] rounded-lg px-3 py-2 text-[12px] text-[#f4f4f4]"
            />
            <button
              onClick={copy}
              className="px-3 py-2 text-[11px] font-medium bg-[#C89B3C] text-[#0a0a0a] rounded-lg hover:bg-[#8f6f26] transition-colors"
            >
              {copied ? "✓" : "Copy"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-[#5c5c5c] uppercase tracking-wider">Content type</label>
            <div className="mt-1 px-3 py-2 bg-[#0a0a0a] border border-[#232323] rounded-lg text-[12px] text-[#f4f4f4]">
              application/json
            </div>
          </div>
          <div>
            <label className="text-[11px] text-[#5c5c5c] uppercase tracking-wider">Secret</label>
            <div className="mt-1 px-3 py-2 bg-[#0a0a0a] border border-[#232323] rounded-lg text-[12px] text-[#C89B3C]">
              GITHUB_WEBHOOK_SECRET env var
            </div>
          </div>
        </div>

        <div>
          <label className="text-[11px] text-[#5c5c5c] uppercase tracking-wider">Events</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {["push", "workflow_run"].map((e) => (
              <span key={e} className="text-[11px] px-2 py-0.5 rounded bg-[#232323] text-[#9d9d9d]">
                {e}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default WebhookSettings;
