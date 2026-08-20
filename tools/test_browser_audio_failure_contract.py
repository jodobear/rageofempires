#!/usr/bin/env python3

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src" / "audio_system_web.cpp"


class BrowserAudioFailureContractTests(unittest.TestCase):
    def test_optional_media_errors_remain_diagnostic_only(self) -> None:
        source = SOURCE.read_text(encoding="utf-8")

        self.assertNotIn("Module.reportFailure", source)
        for diagnostic in (
            "Music media error",
            "Music unlock failed",
            "Music resume failed",
            "Effect media error",
            "Effect playback failed",
        ):
            self.assertIn(diagnostic, source)
        self.assertIn("telemetry.errors.push(message)", source)


if __name__ == "__main__":
    unittest.main()
