import { useTranslation } from "@/i18n";

export default function ErrorLog() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{t("errorLog.title")}</h1>
        <p className="text-sm text-[--color-muted-foreground] mt-1">
          {t("errorLog.subtitle")}
        </p>
      </div>
      <div className="flex items-center justify-center py-12 text-sm text-[--color-muted-foreground]">
        {t("errorLog.empty")}
      </div>
    </div>
  );
}
