CREATE TABLE "Novelty" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE,
    "days" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "affectsPayroll" BOOLEAN NOT NULL DEFAULT true,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Novelty_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Novelty_companyId_dateFrom_idx" ON "Novelty"("companyId", "dateFrom");
CREATE INDEX "Novelty_employeeId_dateFrom_idx" ON "Novelty"("employeeId", "dateFrom");

ALTER TABLE "Novelty" ADD CONSTRAINT "Novelty_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Novelty" ADD CONSTRAINT "Novelty_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
