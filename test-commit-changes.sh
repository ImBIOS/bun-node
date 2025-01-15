# #!/bin/bash

# # Start bashcov for coverage tracking
# bashcov start

# # Set up test environment for versions.json
# echo '{
#   "bun": {
#     "canary": "1.0.0-canary",
#     "latest": "1.0.0"
#   },
#   "nodejs": {
#     "v14": { "name": "v14", "version": "14.17.6" },
#     "v16": { "name": "v16", "version": "16.8.0" }
#   }
# }' >versions.json

# # Run the original script (commit the changes)
# ./commit-changes.sh

# # Now, ensure the commit is undone completely
# git reset --hard HEAD~1 # This will undo the most recent commit

# # Confirm there's no staged change or modified file
# git status # This should show no changes in the working directory

# # Run bashcov report and other steps after reset
# bashcov report

# # Generate lcov report (bashcov will create the lcov report file)
# bashcov report --lcov >lcov-report.lcov

# # Optional: Check the generated lcov report
# cat lcov-report.lcov
