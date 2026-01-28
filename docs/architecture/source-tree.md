# Source Tree

```
til-agent-observatory/
├── infrastructure/
│   ├── cdk/
│   │   ├── stacks/
│   │   │   ├── api-stack.ts
│   │   │   ├── compute-stack.ts
│   │   │   ├── data-stack.ts
│   │   │   └── monitoring-stack.ts
│   │   ├── lib/
│   │   │   └── lambda-constructs.ts
│   │   └── app.ts
│   ├── cloudfront/
│   │   └── error-responses.yaml
│   └── README.md
├── packages/
│   ├── agents/
│   │   ├── manager/
│   │   │   ├── lambda_function.py
│   │   │   ├── prompts.py
│   │   │   └── requirements.txt
│   │   ├── worker/
│   │   │   ├── lambda_function.py
│   │   │   ├── prompts.py
│   │   │   └── requirements.txt
│   │   ├── sub-workers/
│   │   │   ├── cfp-extractor/
│   │   │   │   ├── lambda_function.py
│   │   │   │   └── requirements.txt
│   │   │   ├── evidence-researcher/
│   │   │   ├── draft-generator/
│   │   │   └── red-team-reviewer/
│   │   └── evaluator/
│   │       ├── lambda_function.py
│   │       └── requirements.txt
│   ├── api/
│   │   ├── src/
│   │   │   ├── handlers/
│   │   │   │   ├── generate.ts
│   │   │   │   ├── status.ts
│   │   │   │   ├── feedback.ts
│   │   │   │   ├── dashboard.ts
│   │   │   │   └── workflow.ts
│   │   │   ├── websocket/
│   │   │   │   ├── handler.ts
│   │   │   │   └── broadcast.ts
│   │   │   ├── utils/
│   │   │   │   ├── token-verification.ts
│   │   │   │   └── validation.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── stores/
│   │   │   ├── services/
│   │   │   └── App.tsx
│   │   ├── public/
│   │   │   └── index.html
│   │   ├── package.json
│   │   └── vite.config.ts
│   ├── shared/
│   │   ├── schema-validator/
│   │   │   ├── python/
│   │   │   │   └── validator.py
│   │   │   └── nodejs/
│   │   │       └── validator.js
│   │   ├── artifact-schemas/
│   │   │   ├── artifact-envelope.schema.json
│   │   │   ├── style-profile-v1.schema.json
│   │   │   ├── evidence-bundle-v1.schema.json
│   │   │   ├── draft-candidates-v1.schema.json
│   │   │   └── review-feedback-v1.schema.json
│   │   └── dynamodb-libs/
│   │       ├── python/
│   │       │   └── dynamodb_client.py
│   │       └── nodejs/
│   │           └── dynamodb_client.ts
│   └── tools/
│       ├── dynamodb-lookup/
│       │   └── lambda_function.py
│       └── web-search/
│           └── lambda_function.py
├── step-functions/
│   └── state-machine.json
├── scripts/
│   ├── deploy.sh
│   └── seed-conference-data.py
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
│   ├── prd.md
│   ├── architecture.md
│   ├── ux-spec.md
│   └── ...
├── .github/
│   └── workflows/
│       └── deploy.yml
├── package.json
└── README.md
```

---
