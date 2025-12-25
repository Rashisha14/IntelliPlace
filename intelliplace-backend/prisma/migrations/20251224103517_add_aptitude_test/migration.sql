-- CreateTable
CREATE TABLE "aptitude_tests" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "sections" JSONB NOT NULL,
    "cutoff" INTEGER,
    "totalQuestions" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "startedAt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aptitude_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aptitude_questions" (
    "id" SERIAL NOT NULL,
    "test_id" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "question_text" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correct_index" INTEGER NOT NULL,
    "marks" INTEGER DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aptitude_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "aptitude_tests_job_id_key" ON "aptitude_tests"("job_id");

-- CreateIndex
CREATE INDEX "aptitude_tests_job_id_idx" ON "aptitude_tests"("job_id");

-- CreateIndex
CREATE INDEX "aptitude_questions_test_id_idx" ON "aptitude_questions"("test_id");

-- AddForeignKey
ALTER TABLE "aptitude_tests" ADD CONSTRAINT "aptitude_tests_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aptitude_questions" ADD CONSTRAINT "aptitude_questions_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "aptitude_tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
