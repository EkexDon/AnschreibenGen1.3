import re
import logging
from generator import _TEMPLATE

# Simple mock of what would happen in generator.py
def mock_extract(text):
    latex_code = text.strip()
    
    # Mirroring the logic in generator.py
    full_match = re.search(r"(\\documentclass.*\\end\{document\})", latex_code, re.DOTALL)
    begin_match = re.search(r"(\\begin\{document\}.*\\end\{document\})", latex_code, re.DOTALL)
    
    if full_match:
        return full_match.group(1)
    elif begin_match:
        body = begin_match.group(1)
        if r"\documentclass" not in latex_code[:begin_match.start()]:
            preamble = _TEMPLATE.split(r"\begin{document}")[0]
            return preamble + body
        else:
            return latex_code[latex_code.find(r"\documentclass"):begin_match.end()]
    else:
        latex_code = re.sub(r"^```(?:latex|tex)?\s*\n", "", latex_code)
        latex_code = re.sub(r"\n```\s*$", "", latex_code)
        return latex_code

def test_extraction():
    # Case 1: Markdown fences
    input1 = "```latex\n\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}\n```"
    assert "\\documentclass{article}" in mock_extract(input1)
    assert "\\end{document}" in mock_extract(input1)
    
    # Case 2: Commentary before and after
    input2 = "Here is your LaTeX:\n\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}\nHope this helps!"
    assert mock_extract(input2) == "\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}"
    
    # Case 3: Only begin/end document (missing preamble)
    input3 = "I generated the body for you:\n\\begin{document}\nBody text\n\\end{document}"
    result3 = mock_extract(input3)
    assert "\\documentclass" in result3
    assert "\\begin{document}\nBody text\n\\end{document}" in result3
    
    # Case 4: Raw text with no markers (should still work if it's just LaTeX)
    input4 = "\\documentclass{article}\n\\begin{document}\nRaw\n\\end{document}"
    assert mock_extract(input4) == input4

    print("All extraction tests passed!")

if __name__ == "__main__":
    test_extraction()
